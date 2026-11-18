import { Request, Response, NextFunction } from "express";
import { RegisterUser } from "../../../application/use-cases/auth/RegisterUser.js";
import { LoginUser } from "../../../application/use-cases/auth/LoginUser.js";
import { RefreshTokens } from "../../../application/use-cases/auth/RefreshTokens.js";
import { LogoutUser } from "../../../application/use-cases/auth/LogoutUser.js";
import { IUserRepository } from "../../../domain/repositories/IUserRepository.js";
import { UnauthorizedError } from "../../../domain/errors/UnauthorizedError.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "strict" as const,
  path: "/"
};

export class AuthController {
  constructor(
    private registerUser: RegisterUser,
    private loginUser: LoginUser,
    private refreshTokens: RefreshTokens,
    private logoutUser: LogoutUser,
    private userRepository: IUserRepository
  ) {}

  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, fullName, recaptchaToken } = req.body;
      const result = await this.registerUser.execute({
        email,
        password,
        fullName,
        recaptchaToken
      });

      res.cookie("accessToken", result.tokens.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 15 * 60 * 1000 // 15m
      });

      res.cookie("refreshToken", result.tokens.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7d
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            status: result.user.status,
            fullName: result.user.profile?.fullName,
            createdAt: result.user.createdAt
          },
          tokens: {
            accessToken: result.tokens.accessToken,
            expiresIn: result.tokens.expiresIn
          }
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, recaptchaToken } = req.body;
      const result = await this.loginUser.execute({
        email,
        password,
        recaptchaToken
      });

      res.cookie("accessToken", result.tokens.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 15 * 60 * 1000
      });

      res.cookie("refreshToken", result.tokens.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            status: result.user.status,
            fullName: result.user.profile?.fullName,
            createdAt: result.user.createdAt
          },
          tokens: {
            accessToken: result.tokens.accessToken,
            expiresIn: result.tokens.expiresIn
          }
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      if (!refreshToken) {
        throw new UnauthorizedError("Refresh token no proporcionado.");
      }

      const tokens = await this.refreshTokens.execute({ refreshToken });

      res.cookie("accessToken", tokens.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 15 * 60 * 1000
      });

      res.cookie("refreshToken", tokens.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
      await this.logoutUser.execute({ refreshToken });

      res.clearCookie("accessToken", COOKIE_OPTIONS);
      res.clearCookie("refreshToken", COOKIE_OPTIONS);

      res.json({ success: true, message: "Sesión cerrada correctamente." });
    } catch (err) {
      next(err);
    }
  };

  public me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Usuario no autenticado.");
      }

      const user = await this.userRepository.findById(req.user.userId);
      if (!user) {
        throw new UnauthorizedError("Usuario no encontrado.");
      }

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          status: user.status,
          fullName: user.profile?.fullName,
          avatarUrl: user.profile?.avatarUrl,
          createdAt: user.createdAt
        }
      });
    } catch (err) {
      next(err);
    }
  };
}
