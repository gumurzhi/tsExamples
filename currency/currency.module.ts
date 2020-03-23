import { Global, Module } from '@nestjs/common';
import { AerospikeModule } from '../aerospike';
import { CurrencyService } from './currency.service';

@Global()
@Module({
  providers: [CurrencyService],
  exports: [CurrencyService],
  imports: [AerospikeModule],
})
export class CurrencyModule {}
