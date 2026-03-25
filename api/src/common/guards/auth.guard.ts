import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { jwtVerify } from "jose";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

const SESSION_COOKIE_NAME = "telehost_session";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // Try cookie first, then Authorization header
    let token: string | undefined;
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader
        .split(";")
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (match) {
        token = match.split("=").slice(1).join("=");
      }
    }
    if (!token) {
      const auth = request.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        token = auth.slice(7);
      }
    }

    if (!token) {
      throw new UnauthorizedException("No session");
    }

    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      request.user = {
        userId: payload.userId as string,
        walletAddress: payload.walletAddress as string,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid session");
    }
  }
}
