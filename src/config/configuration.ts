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
  };
  imageProcessing: {
    uploadDir: string;
    publicPath: string;
    maxUploadSizeMb: number;
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
  },
  imageProcessing: {
    // Relative to the project root - where generated variant files are written on disk.
    uploadDir: process.env.IMAGE_UPLOAD_DIR ?? 'uploads',
    // Path prefix the files are served under (see main.ts useStaticAssets).
    publicPath: process.env.IMAGE_PUBLIC_PATH ?? '/uploads',
    maxUploadSizeMb: parseInt(process.env.IMAGE_MAX_UPLOAD_MB ?? '15', 10),
  },
});
