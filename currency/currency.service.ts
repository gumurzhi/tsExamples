import { HttpStatus, Injectable } from '@nestjs/common';
import { CurrencyRecordInterface, CurrencyRecordOriginalInterface } from './currency.interface';
import { LoggerService } from '@sportsbook-bff/logger';
import { RequestErrorDecorator } from '../../decorators/requestError.decorator';
import { ConfigService } from '../config';
import { assertEx } from '../../utils';
import axios from 'axios';
import { DEFAULT_CURRENCY_RATE } from './currency.constant';
import { healthDecorator } from '../../decorators';
import { ExternalServiceNames } from '../health/health.interface';

@Injectable()
export class CurrencyService {
  constructor(private configService: ConfigService, private log: LoggerService) {}

  @RequestErrorDecorator
  @healthDecorator(ExternalServiceNames.Currency)
  public async getCurrency(currencyCode: string): Promise<CurrencyRecordInterface> {
    assertEx(currencyCode, 'Currency code expected', HttpStatus.BAD_REQUEST);
    const { host, port, url } = this.configService.currencyServer;
    return axios
      .get<CurrencyRecordOriginalInterface>(`http://${host}:${port}${url}/${currencyCode}`)
      .then(({ status, data }) => {
        assertEx(
          status === HttpStatus.OK,
          `getCurrency got response with status: ${status}. \n ${JSON.stringify(data)}`,
        );
        this.log.debug(`requested currency: ${currencyCode}. Response: ${JSON.stringify(data)}`);
        return { currencyRate: data.rate, currencyRateeur: data.rateEUR };
      })
      .catch(err => {
        this.log.error(`makeGetCurrencyRequest got error: ${err.message}`);
        return DEFAULT_CURRENCY_RATE;
      });
  }
}
