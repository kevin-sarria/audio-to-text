export interface ICaptchaVerifier {
  verify(token?: string, clientIp?: string): Promise<boolean>;
}
