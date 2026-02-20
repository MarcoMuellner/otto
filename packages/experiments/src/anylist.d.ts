declare module "anylist" {
  export type AnyListListRecord = {
    identifier?: string;
    name?: string;
  };

  export default class AnyList {
    constructor(input: { email: string; password: string });
    lists?: AnyListListRecord[];
    login(): Promise<void>;
    getLists(): Promise<void>;
    teardown(): void;
  }
}
