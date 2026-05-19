declare module "react-native-mmkv" {
  export class MMKV {
    set(key: string, value: string): void;
    getString(key: string): string | undefined;
    delete(key: string): void;
  }
}
