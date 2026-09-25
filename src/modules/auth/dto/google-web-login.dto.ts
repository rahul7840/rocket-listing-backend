import { IsString } from 'class-validator';

export class GoogleWebLoginDto {
  /** Google Identity Services ID token from the website's Sign in with Google button. */
  @IsString()
  idToken: string;
}
