/// <reference types="vite/client" />

declare module "*?inline-js" {
  const content: string;
  export default content;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const browser: any;
}
