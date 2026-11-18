import { ICaptchaVerifier } from "../../domain/services/ICaptchaVerifier.js";

export class RecaptchaVerifier implements ICaptchaVerifier {
  constructor(
    private secretKey: string,
    private enabled: boolean = true,
    private minScore: number = 0.5
  ) {}

  public async verify(token?: string, _clientIp?: string): Promise<boolean> {
    if (!this.enabled) {
      return true;
    }

    if (!token) {
      return false;
    }

    try {
      const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: this.secretKey,
          response: token
        })
      });

      const data = (await response.json()) as any;
      if (!data.success) return false;

      return typeof data.score === "number" ? data.score >= this.minScore : true;
    } catch (err) {
      console.error("Error verificando reCAPTCHA v3:", err);
      return false;
    }
  }
}
