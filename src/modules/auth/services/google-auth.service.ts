import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { AppConfig } from '../../../config/configuration';

export interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Verifies the Google OAuth access token the extension gets from
 * chrome.identity.getAuthToken() - no Firebase involved. Two calls to
 * Google are made: tokeninfo confirms the token was minted for one of OUR
 * OAuth clients (so a token from an unrelated app can't be replayed here),
 * and userinfo returns the profile fields we store.
 */
@Injectable()
export class GoogleAuthService {
  private readonly oauth2Client = new OAuth2Client();
  private readonly allowedClientIds: string[];
  private readonly allowedWebClientIds: string[];

  constructor(private readonly configService: ConfigService) {
    const googleAuth = this.configService.getOrThrow<AppConfig['googleAuth']>(
      'googleAuth',
      { infer: true },
    );
    this.allowedClientIds = googleAuth.clientIds;
    this.allowedWebClientIds = googleAuth.webClientIds;
  }

  async verifyAccessToken(accessToken: string): Promise<GoogleProfile> {
    if (this.allowedClientIds.length === 0) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    const tokenInfo = await this.oauth2Client
      .getTokenInfo(accessToken)
      .catch(() => {
        throw new UnauthorizedException('Invalid or expired Google session');
      });

    if (!this.allowedClientIds.includes(tokenInfo.aud)) {
      throw new UnauthorizedException('Token was not issued for this app');
    }

    const userInfo = await this.fetchUserInfo(accessToken);
    if (!userInfo.email || userInfo.email_verified === false) {
      throw new UnauthorizedException('Google account has no verified email');
    }

    return {
      googleId: userInfo.sub,
      email: userInfo.email,
      displayName: userInfo.name ?? null,
      photoUrl: userInfo.picture ?? null,
    };
  }

  /**
   * Verifies the Google ID token issued to the website's Sign in with Google
   * button (Google Identity Services). Separate from verifyAccessToken above:
   * a web client gets an ID token, not an access token, and it's verified
   * locally (signature + audience) rather than via a tokeninfo round-trip.
   */
  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    if (this.allowedWebClientIds.length === 0) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    const ticket = await this.oauth2Client
      .verifyIdToken({ idToken, audience: this.allowedWebClientIds })
      .catch(() => {
        throw new UnauthorizedException('Invalid or expired Google session');
      });

    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified === false) {
      throw new UnauthorizedException('Google account has no verified email');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      displayName: payload.name ?? null,
      photoUrl: payload.picture ?? null,
    };
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      throw new UnauthorizedException('Invalid or expired Google session');
    }
    return response.json() as Promise<GoogleUserInfo>;
  }
}
