import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envSchema } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // isGlobal so feature modules can inject ConfigService without re-importing.
    // A failing schema throws here, before the app starts listening.
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
    }),
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
