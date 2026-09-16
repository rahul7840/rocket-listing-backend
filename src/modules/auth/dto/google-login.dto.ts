import { IsString } from 'class-validator';

export class GoogleLoginDto {
  /** OAuth access token from chrome.identity.getAuthToken() on the extension. */
  @IsString()
  accessToken: string;
}
