import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { CarouselModule } from './modules/carousel/carousel.module';
import { MoviesModule } from './modules/movies/movies.module';

@Module({
  imports: [
    // isGlobal so feature modules can inject ConfigService without re-importing.
    // A failing schema throws here, before the app starts listening.
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
    }),
    PrismaModule,
    CarouselModule,
    MoviesModule,
  ],
})
export class AppModule {}
