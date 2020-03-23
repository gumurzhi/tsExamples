import { Module } from '@nestjs/common';
import { MarketUpdateModule } from '../market-updates';
import { SelectionModule } from '../selection';
import { SportEventUpdatesModule } from '../sport-event-updates';
import { UpdateStreamService } from './update-stream.service';

@Module({
  exports: [UpdateStreamService],
  providers: [UpdateStreamService],
  imports: [SportEventUpdatesModule, MarketUpdateModule, SelectionModule],
})
export class UpdateStreamModule {}
