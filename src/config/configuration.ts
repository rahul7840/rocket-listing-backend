export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    logging: boolean;
    ssl: boolean;
  };
  imageProcessing: {
    uploadDir: string;
    publicPath: string;
    maxUploadSizeMb: number;
  };
  googleAuth: {
    /** OAuth client IDs the extension is allowed to mint access tokens for (local dev + published store build). */
    clientIds: string[];
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  admin: {
    jwtSecret: string;
    jwtExpiresIn: string;
    seedEmail: string;
    seedPassword: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'rocket listing',
    logging: process.env.DB_LOGGING === 'true',
    ssl: process.env.DB_SSL === 'true',
  },
  imageProcessing: {
    // Relative to the project root - where generated variant files are written on disk.
    uploadDir: process.env.IMAGE_UPLOAD_DIR ?? 'uploads',
    // Path prefix the files are served under (see main.ts useStaticAssets).
    publicPath: process.env.IMAGE_PUBLIC_PATH ?? '/uploads',
    maxUploadSizeMb: parseInt(process.env.IMAGE_MAX_UPLOAD_MB ?? '15', 10),
  },
  googleAuth: {
    // Comma-separated - one per "Chrome Extension" OAuth client (local dev
    // build id + Chrome Web Store build id). A token whose audience isn't in
    // this list is rejected, so it can't have been minted for another app.
    clientIds: (process.env.GOOGLE_OAUTH_CLIENT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  },
  admin: {
    // Separate secret from the regular user JWT - admin tokens must not be
    // verifiable with the user secret or vice versa. Generate one with:
    //   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
    jwtSecret: process.env.ADMIN_JWT_SECRET ?? '',
    jwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN ?? '12h',
    // Seeded admin account (src/database/seeders) - bcrypt-hashed on insert.
    seedEmail: process.env.ADMIN_SEED_EMAIL ?? '',
    seedPassword: process.env.ADMIN_SEED_PASSWORD ?? '',
  },
});
