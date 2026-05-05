export interface Theme {
  name: string;
  extends?: string;
  tokens: Record<string, string>;
}
