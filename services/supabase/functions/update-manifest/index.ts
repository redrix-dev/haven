import {
  corsHeaders,
  createServiceClient,
  okOptionsResponse,
  requireSupabaseEnv,
} from '../_shared/common.ts';

type OtaReleaseRow = {
  id: string;
  channel: string;
  runtime_version: string;
  bundle_url: string;
  manifest_url: string | null;
  created_at: string;
  is_active: boolean;
};

type MetadataAsset = {
  path: string;
  ext?: string;
};

type MetadataFileGroup = {
  bundle: string;
  assets: MetadataAsset[];
};

type ExportMetadata = {
  fileMetadata?: Partial<Record<'ios' | 'android', MetadataFileGroup>>;
};

const expoManifestHeaders = {
  ...corsHeaders,
  'Cache-Control': 'private, max-age=0',
  'Content-Type': 'application/expo+json',
  'expo-manifest-filters': '',
  'expo-protocol-version': '1',
  'expo-server-defined-headers': '',
  'expo-sfv-version': '0',
} as const;

const getTrimmedHeader = (req: Request, key: string): string | null => {
  const value = req.headers.get(key)?.trim();
  return value && value.length > 0 ? value : null;
};

const getPlatform = (req: Request): 'ios' | 'android' => {
  const platform = getTrimmedHeader(req, 'expo-platform')?.toLowerCase();
  return platform === 'android' ? 'android' : 'ios';
};

const getBasename = (path: string): string => {
  const lastSegment = path.split('/').pop() ?? path;
  return lastSegment.length > 0 ? lastSegment : path;
};

const getFileExtension = (path: string): string | null => {
  const basename = getBasename(path);
  const parts = basename.split('.');
  if (parts.length < 2) return null;
  const extension = parts.pop()?.trim().toLowerCase();
  return extension ? extension : null;
};

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const hashRemoteAsset = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return encodeBase64Url(new Uint8Array(digest));
  } catch {
    return null;
  }
};

const guessContentType = (extension: string | null, path: string): string => {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'ttf':
      return 'font/ttf';
    case 'otf':
      return 'font/otf';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'wav':
      return 'audio/wav';
    case 'json':
      return 'application/json';
    case 'hbc':
    case 'js':
      return 'application/javascript';
    default:
      return path.endsWith('.map') ? 'application/json' : 'application/octet-stream';
  }
};

const getManifestRoot = (manifestUrl: string): URL | null => {
  try {
    return new URL('./', manifestUrl);
  } catch {
    return null;
  }
};

const fetchExportMetadata = async (manifestUrl: string | null): Promise<ExportMetadata | null> => {
  if (!manifestUrl || !manifestUrl.endsWith('metadata.json')) return null;

  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) return null;
    return (await response.json()) as ExportMetadata;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return okOptionsResponse();
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  const channel = getTrimmedHeader(req, 'expo-channel-name') ?? 'production';
  const platform = getPlatform(req);
  const runtimeVersion = getTrimmedHeader(req, 'expo-runtime-version');
  const currentUpdateId = getTrimmedHeader(req, 'expo-current-update-id');

  if (!runtimeVersion) {
    return new Response('Missing runtime version', {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { supabaseUrl, serviceRoleKey } = requireSupabaseEnv();
  const supabase = createServiceClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from('ota_releases')
    .select('id, channel, runtime_version, bundle_url, manifest_url, created_at, is_active')
    .eq('channel', channel)
    .eq('runtime_version', runtimeVersion)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single<OtaReleaseRow>();

  if (error || !data) {
    return new Response(null, {
      status: 204,
      headers: expoManifestHeaders,
    });
  }

  if (currentUpdateId && data.id === currentUpdateId) {
    return new Response(null, {
      status: 204,
      headers: expoManifestHeaders,
    });
  }

  const exportMetadata = await fetchExportMetadata(data.manifest_url);
  const manifestRoot = data.manifest_url ? getManifestRoot(data.manifest_url) : null;
  const platformMetadata = exportMetadata?.fileMetadata?.[platform];

  if (manifestRoot && platformMetadata?.bundle) {
    const launchBundlePath = platformMetadata.bundle;
    const launchBundleExtension = getFileExtension(launchBundlePath);
    const launchAssetUrl = new URL(launchBundlePath, manifestRoot).toString();
    const launchAssetHash = await hashRemoteAsset(launchAssetUrl);

    const manifest = {
      id: data.id,
      createdAt: data.created_at,
      runtimeVersion: data.runtime_version,
      launchAsset: {
        url: launchAssetUrl,
        key: getBasename(launchBundlePath),
        contentType: guessContentType(launchBundleExtension, launchBundlePath),
        hash: launchAssetHash ?? undefined,
      },
      assets: await Promise.all((platformMetadata.assets ?? []).map(async (asset) => {
        const extension = asset.ext?.trim().toLowerCase() || getFileExtension(asset.path);
        const assetUrl = new URL(asset.path, manifestRoot).toString();
        const assetHash = await hashRemoteAsset(assetUrl);
        return {
          url: assetUrl,
          key: getBasename(asset.path),
          contentType: guessContentType(extension, asset.path),
          fileExtension: extension ? `.${extension}` : undefined,
          hash: assetHash ?? undefined,
        };
      })),
      metadata: {},
      extra: {},
    };

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: expoManifestHeaders,
    });
  }

  const fallbackLaunchAssetHash = await hashRemoteAsset(data.bundle_url);

  const manifest = {
    id: data.id,
    createdAt: data.created_at,
    runtimeVersion: data.runtime_version,
    launchAsset: {
      url: data.bundle_url,
      key: data.id,
      contentType: 'application/javascript',
      hash: fallbackLaunchAssetHash ?? undefined,
    },
    assets: [],
    metadata: {},
    extra: {},
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: expoManifestHeaders,
  });
});
