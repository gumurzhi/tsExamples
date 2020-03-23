import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { SSEMiddleware } from '../../middlewares';
import { AerospikeModule } from '../aerospike';
import { AuthModule } from '../auth';
import { MarketUpdateModule } from '../market-updates';
import { SelectionModule } from '../selection';
import { SportEventUpdatesModule } from '../sport-event-updates';
import { StatisticsModule } from '../statistics';
import { UpdateStreamModule } from '../update-stream';
import { BetslipController } from './betslip.controller';
import { BetslipService } from './betslip.service';
import { BetslipSettingsModule } from '../betslip-settings';
import { CurrencyModule } from '../currency';

@Module({
  controllers: [BetslipController],
  providers: [BetslipService],
  exports: [BetslipService, BetslipSettingsModule],
  imports: [
    StatisticsModule,
    AerospikeModule,
    AuthModule,
    SelectionModule,
    MarketUpdateModule,
    SportEventUpdatesModule,
    UpdateStreamModule,
    BetslipSettingsModule,
    CurrencyModule,
  ],
})
export class BetslipModule implements NestModule {
  public configure(consumer: MiddlewareConsumer) {
    consumer.apply(SSEMiddleware).forRoutes({ path: '/betslip/updates/sse', method: RequestMethod.GET });
  }
}
