import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { LoggerService } from '@sportsbook-bff/logger';
import { CheckIPService } from '../modules/check-ip';
import { ConfigService } from '../modules/config';

@Injectable()
export class CheckIPGuard implements CanActivate {
  constructor(
    private log: LoggerService,
    private checkIPService: CheckIPService,
    private configService: ConfigService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.configService.appConfig.validateCountry) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const countryCode = await this.checkIPService.getCountryCode(request.ip);
    this.log.silly(`got response from country: ${countryCode}`);

    if (this.checkIPService.isValidCountry(countryCode)) {
      this.log.silly(`country is valid`);
      return true;
    }
    this.log.error(`country ${countryCode} is not valid`);
    throw new HttpException(`Illegal country ${countryCode}`, HttpStatus.BAD_REQUEST);
  }
}
