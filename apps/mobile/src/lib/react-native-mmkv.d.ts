declare module "react-native-mmkv" {
  export interface MMKV {
    set(key: string, value: boolean | string | number | ArrayBuffer): void;
    getString(key: string): string | undefined;
    remove(key: string): boolean;
  }

  export type Configuration = {
    id: string;
  };

  export function createMMKV(configuration?: Configuration): MMKV;
}
