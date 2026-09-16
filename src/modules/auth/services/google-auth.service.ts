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

  constructor(private readonly configService: ConfigService) {
    this.allowedClientIds = this.configService.getOrThrow<
      AppConfig['googleAuth']
    >('googleAuth', { infer: true }).clientIds;
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
