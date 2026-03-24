import React, { useEffect, useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Avatar, AvatarFallback, AvatarImage } from '@shared/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/components/ui/alert-dialog';
import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Switch } from '@shared/components/ui/switch';
import { getErrorMessage } from '@platform/lib/errors';
import {
  HAVEN_PRIVACY_URL,
  HAVEN_TERMS_URL,
  openPlatformExternalUrl,
} from '@platform/urls';
import type { UpdaterStatus } from '@platform/desktop/types';

const AVATAR_FILE_SIZE_LIMIT = 5 * 1024 * 1024;
const AVATAR_EDITOR_ASPECT_RATIO = 1;
const AVATAR_EXPORT_SIZE = 512;
const AVATAR_PREVIEW_SIZE = 96;

const createCenteredSquareCrop = (width: number, height: number): Crop =>
  centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 80,
      },
      AVATAR_EDITOR_ASPECT_RATIO,
      width,
      height
    ),
    width,
    height
  );

const drawCropToCanvas = (
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  crop: PixelCrop,
  outputSize: number
) => {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable.');
  }

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = outputSize;
  canvas.height = outputSize;

  context.clearRect(0, 0, outputSize, outputSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    outputSize,
    outputSize
  );
};

const exportCroppedAvatarFile = async (
  image: HTMLImageElement,
  crop: PixelCrop,
  sourceName: string
): Promise<File> => {
  const canvas = document.createElement('canvas');
  drawCropToCanvas(image, canvas, crop, AVATAR_EXPORT_SIZE);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (!value) {
          reject(new Error('Failed to encode avatar image.'));
          return;
        }
        resolve(value);
      },
      'image/webp',
      0.92
    );
  });

  const fileBaseName = sourceName.replace(/\.[^.]+$/, '').trim() || 'avatar';
  return new File([blob], `${fileBaseName}.webp`, {
    type: 'image/webp',
    lastModified: Date.now(),
  });
};

interface AccountSettingsModalProps {
  userEmail: string;
  initialUsername: string;
  initialAvatarUrl: string | null;
  autoUpdateEnabled: boolean;
  updaterStatus: UpdaterStatus | null;
  updaterStatusLoading: boolean;
  checkingForUpdates: boolean;
  onClose: () => void;
  onSave: (values: {
    username: string;
    avatarUrl: string | null;
    avatarFile?: File | null;
  }) => Promise<void>;
  onOpenVoiceSettings: () => void;
  onAutoUpdateChange: (enabled: boolean) => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

export function AccountSettingsModal({
  userEmail,
  initialUsername,
  initialAvatarUrl,
  autoUpdateEnabled,
  updaterStatus,
  updaterStatusLoading,
  checkingForUpdates,
  onClose,
  onSave,
  onOpenVoiceSettings,
  onAutoUpdateChange,
  onCheckForUpdates,
  onSignOut,
  onDeleteAccount,
}: AccountSettingsModalProps) {
  const [username, setUsername] = useState(initialUsername);
  const [saving, setSaving] = useState(false);
  const [updatingAutoUpdatePreference, setUpdatingAutoUpdatePreference] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDisableAutoUpdateConfirm, setShowDisableAutoUpdateConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoUpdateError, setAutoUpdateError] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropSourceName, setCropSourceName] = useState('avatar');
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreviewUrl, setPendingAvatarPreviewUrl] = useState<string | null>(null);
  const [pendingAvatarRemoved, setPendingAvatarRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const updaterControlsUnsupported = updaterStatus?.supported === false;

  useEffect(() => {
    return () => {
      if (cropSourceUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    };
  }, [cropSourceUrl]);

  useEffect(() => {
    return () => {
      if (pendingAvatarPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(pendingAvatarPreviewUrl);
      }
    };
  }, [pendingAvatarPreviewUrl]);

  useEffect(() => {
    if (!completedCrop || !cropImageRef.current || !previewCanvasRef.current) {
      return;
    }

    if (completedCrop.width <= 0 || completedCrop.height <= 0) {
      return;
    }

    drawCropToCanvas(
      cropImageRef.current,
      previewCanvasRef.current,
      completedCrop,
      AVATAR_PREVIEW_SIZE
    );
  }, [completedCrop]);

  const previewInitial = username.trim().charAt(0).toUpperCase() || 'U';
  const avatarPreviewUrl = pendingAvatarRemoved
    ? null
    : pendingAvatarPreviewUrl ?? initialAvatarUrl ?? null;
  const hasAvatar = Boolean(avatarPreviewUrl);

  const updaterStatusLabel = (() => {
    if (!updaterStatus) return 'Unavailable';

    switch (updaterStatus.status) {
      case 'ready':
        return updaterStatus.enabled ? 'Enabled' : 'Disabled';
      case 'checking':
        return 'Checking...';
      case 'update_available':
        return 'Update available';
      case 'up_to_date':
        return 'Up to date';
      case 'update_downloaded':
        return 'Update downloaded';
      case 'unsupported_platform':
        return 'Unsupported platform';
      case 'dev_mode':
        return 'Dev mode';
      case 'disabled':
        return 'Disabled';
      case 'disabled_pending_restart':
        return 'Disabled (restart required)';
      case 'error':
        return 'Update error';
      default:
        return 'Idle';
    }
  })();

  const resetCropEditor = () => {
    setCropSourceUrl(null);
    setCropSourceName('avatar');
    setCrop(undefined);
    setCompletedCrop(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAutoUpdateChange = async (enabled: boolean) => {
    if (updaterControlsUnsupported) return;

    setUpdatingAutoUpdatePreference(true);
    setAutoUpdateError(null);

    try {
      await onAutoUpdateChange(enabled);
    } catch (err: unknown) {
      setAutoUpdateError(getErrorMessage(err, 'Failed to update auto-update preference.'));
    } finally {
      setUpdatingAutoUpdatePreference(false);
    }
  };

  const handleAvatarFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) {
      setError('Choose a JPG, PNG, or WEBP image.');
      resetCropEditor();
      return;
    }

    if (nextFile.size > AVATAR_FILE_SIZE_LIMIT) {
      setError('Avatar images must be 5MB or smaller.');
      resetCropEditor();
      return;
    }

    setError(null);
    setPendingAvatarRemoved(false);
    setPendingAvatarFile(null);
    setPendingAvatarPreviewUrl(null);
    setCropSourceName(nextFile.name);
    setCropSourceUrl(URL.createObjectURL(nextFile));
  };

  const handleApplyCrop = async () => {
    if (!cropImageRef.current || !completedCrop) {
      setError('Choose a crop before saving your avatar.');
      return;
    }

    if (completedCrop.width <= 0 || completedCrop.height <= 0) {
      setError('Choose a crop before saving your avatar.');
      return;
    }

    setError(null);

    try {
      const nextFile = await exportCroppedAvatarFile(
        cropImageRef.current,
        completedCrop,
        cropSourceName
      );
      setPendingAvatarFile(nextFile);
      setPendingAvatarPreviewUrl(URL.createObjectURL(nextFile));
      setPendingAvatarRemoved(false);
      resetCropEditor();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to prepare your avatar image.'));
    }
  };

  const handleRemoveAvatar = () => {
    setError(null);
    setPendingAvatarRemoved(true);
    setPendingAvatarFile(null);
    setPendingAvatarPreviewUrl(null);
    resetCropEditor();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        username: username.trim(),
        avatarUrl: pendingAvatarRemoved ? null : initialAvatarUrl,
        avatarFile: pendingAvatarFile,
      });
      setPendingAvatarFile(null);
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save account settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
      onClose();
    } finally {
      setSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setError(null);

    try {
      await onDeleteAccount();
      setShowDeleteAccountConfirm(false);
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete account.'));
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleToggleRequested = (checked: boolean) => {
    if (!checked && autoUpdateEnabled) {
      setShowDisableAutoUpdateConfirm(true);
      return;
    }

    void handleAutoUpdateChange(checked);
  };

  const handleDisableAutoUpdateConfirmed = async () => {
    setShowDisableAutoUpdateConfirm(false);
    await handleAutoUpdateChange(false);
  };

  const handleCheckForUpdates = async () => {
    if (updaterControlsUnsupported) return;

    setAutoUpdateError(null);
    try {
      await onCheckForUpdates();
    } catch (err: unknown) {
      setAutoUpdateError(getErrorMessage(err, 'Failed to check for updates.'));
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          size="sm"
          className="bg-[#18243a] border-[#142033] text-white md:w-[min(92vw,640px)] md:max-w-none md:h-[min(86dvh,720px)] md:max-h-[calc(100dvh-1.5rem)] max-h-[88vh] flex flex-col gap-0 overflow-hidden p-0"
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 border-b border-[#233753] px-4 py-3 sm:px-6 sm:py-4">
            <DialogTitle className="text-2xl font-bold text-white">Account Settings</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="min-h-0 flex flex-1 flex-col">
            <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto space-y-4 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-center gap-3">
                <Avatar
                  size="lg"
                  className="rounded-2xl bg-[#142033] border border-[#304867] data-[size=lg]:size-12"
                >
                  {avatarPreviewUrl && <AvatarImage src={avatarPreviewUrl} alt="Avatar preview" />}
                  <AvatarFallback className="rounded-2xl bg-[#142033] text-white font-semibold">
                    {previewInitial}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs uppercase font-semibold text-[#a9b8cf]">Email</p>
                  <p className="text-sm text-white">{userEmail}</p>
                </div>
                <div className="ml-auto">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onOpenVoiceSettings}
                    disabled={saving || signingOut || deletingAccount}
                  >
                    Voice Settings
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="account-username"
                  className="text-xs font-semibold uppercase text-[#a9b8cf]"
                >
                  Username
                </Label>
                <Input
                  id="account-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-[#142033] border-[#304867] text-white"
                  maxLength={32}
                  required
                />
              </div>

              <div className="space-y-3 rounded-xl border border-[#304867] bg-[#142033] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Profile photo</p>
                    <p className="text-xs text-[#a9b8cf]">
                      Upload a square image. Haven will crop and save a 512x512 WEBP avatar.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleAvatarFileSelected}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving || signingOut || deletingAccount}
                    >
                      Upload Photo
                    </Button>
                    {hasAvatar && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
                        onClick={handleRemoveAvatar}
                        disabled={saving || signingOut || deletingAccount}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                {cropSourceUrl ? (
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
                    <div className="overflow-hidden rounded-xl border border-[#304867] bg-[#101a2b] p-3">
                      <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
                        aspect={AVATAR_EDITOR_ASPECT_RATIO}
                        circularCrop={false}
                        ruleOfThirds
                        keepSelection
                      >
                        <img
                          ref={cropImageRef}
                          src={cropSourceUrl}
                          alt="Crop avatar"
                          className="max-h-[320px] w-full object-contain"
                          onLoad={(event) => {
                            const nextCrop = createCenteredSquareCrop(
                              event.currentTarget.width,
                              event.currentTarget.height
                            );
                            setCrop(nextCrop);
                          }}
                        />
                      </ReactCrop>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs uppercase font-semibold text-[#a9b8cf]">Live Preview</p>
                        <div className="mt-2 flex items-center justify-center rounded-xl border border-[#304867] bg-[#101a2b] p-4">
                          <canvas
                            ref={previewCanvasRef}
                            className="size-12 rounded-2xl border border-[#304867] bg-[#142033]"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button type="button" size="sm" onClick={() => void handleApplyCrop()}>
                          Apply Crop
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-white hover:underline"
                          onClick={resetCropEditor}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#90a5c4]">
                    JPG, PNG, and WEBP are supported. Maximum file size is 5MB.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-[#304867] bg-[#142033] px-3 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Automatic Updates</p>
                    <p className="text-xs text-[#a9b8cf]">
                      Keeps this app current with security and compatibility fixes.
                    </p>
                  </div>
                  <Switch
                    checked={autoUpdateEnabled}
                    onCheckedChange={handleToggleRequested}
                    disabled={updatingAutoUpdatePreference || updaterControlsUnsupported}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[#a9b8cf]">
                    Status: {updaterStatusLoading ? 'Loading...' : updaterStatusLabel}
                  </p>
                  <Button
                    type="button"
                    onClick={() => void handleCheckForUpdates()}
                    disabled={checkingForUpdates || updaterStatusLoading || updaterControlsUnsupported}
                    variant="secondary"
                    size="sm"
                  >
                    {checkingForUpdates ? 'Checking...' : 'Check now'}
                  </Button>
                </div>

                {updaterStatus?.disableNeedsRestart && (
                  <p className="text-xs text-amber-300">
                    Restart required to fully stop active update checks.
                  </p>
                )}

                {updaterStatus?.lastError && (
                  <p className="text-xs text-red-300">Updater: {updaterStatus.lastError}</p>
                )}
              </div>

              <div className="rounded-xl border border-[#304867] bg-[#142033] px-4 py-4 space-y-2">
                <p className="text-sm font-semibold text-white">Legal</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#a9b8cf]">
                  <button
                    type="button"
                    className="text-[#8fc1ff] underline underline-offset-2 hover:text-[#b7dbff]"
                    onClick={() => void openPlatformExternalUrl(HAVEN_TERMS_URL)}
                  >
                    Terms of Service
                  </button>
                  <button
                    type="button"
                    className="text-[#8fc1ff] underline underline-offset-2 hover:text-[#b7dbff]"
                    onClick={() => void openPlatformExternalUrl(HAVEN_PRIVACY_URL)}
                  >
                    Privacy Policy
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              {autoUpdateError && <p className="text-sm text-red-400">{autoUpdateError}</p>}
            </div>

            <DialogFooter className="justify-between sm:justify-between shrink-0 border-t border-[#233753] px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut || deletingAccount}
                  variant="ghost"
                  className="text-red-300 hover:text-red-200 hover:bg-red-900/20"
                >
                  {signingOut ? 'Signing out...' : 'Sign Out'}
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowDeleteAccountConfirm(true)}
                  disabled={saving || signingOut || deletingAccount}
                  variant="ghost"
                  className="text-red-400 hover:text-red-200 hover:bg-red-900/20"
                >
                  Delete Account
                </Button>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={onClose}
                  variant="ghost"
                  className="text-white hover:underline"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || deletingAccount}
                  className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showDisableAutoUpdateConfirm}
        onOpenChange={setShowDisableAutoUpdateConfirm}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable automatic updates?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              Turning updates off can leave you on incompatible builds and may break login, realtime,
              and voice features over time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Keep enabled
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDisableAutoUpdateConfirmed()}
              className="bg-[#b74a56] hover:bg-[#a6424d] text-white"
            >
              Disable updates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteAccountConfirm}
        onOpenChange={(open) => {
          if (deletingAccount) return;
          setShowDeleteAccountConfirm(open);
        }}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account permanently?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              This cannot be undone. Your profile, memberships, messages, and owned communities will
              be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]"
              disabled={deletingAccount}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteAccount()}
              className="bg-[#b74a56] hover:bg-[#a6424d] text-white"
              disabled={deletingAccount}
            >
              {deletingAccount ? 'Deleting...' : 'Delete account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} // CHECKPOINT 3 COMPLETE
// CHECKPOINT 6 COMPLETE
