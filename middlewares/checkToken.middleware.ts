import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { parse as queryParse } from 'querystring';
import { parse as urlParse } from 'url';
import { Next } from '../interfaces';
import { AuthService, RequestUser, TokenPayload } from '../modules/auth';
import { BetslipSettingsService } from '../modules/betslip-settings';

@Injectable()
export class CheckTokenMiddleware implements NestMiddleware {
  constructor(private authService: AuthService, private betslipSettingsService: BetslipSettingsService) {}

  public async use(request: IncomingMessage & { user: RequestUser }, response: ServerResponse, next: Next) {
    if (request.method === 'OPTIONS') {
      return next();
    }
    const parsedUrl = urlParse(request['originalUrl']);
    const parsedQuery: any = queryParse(parsedUrl.query as string);

    const headerToken = request.headers.token;
    const authToken = request.headers.authorization?.substring(7, request.headers.authorization?.length);

    const token = authToken || headerToken || parsedQuery.token;
    if (!token) {
      throw new BadRequestException('token expected');
    }
    try {
      // todo change model in shared components
      // @ts-ignore
      const user: TokenPayload = await this.authService.decodeInternalToken(token);
      if (isNaN(user.customerId)) {
        throw new ForbiddenException('only customerId number allowed');
      }

      const betslipCustomerSettings = await this.betslipSettingsService.getBetslipCustomerSettings(user.customerId);
      request.user = { ...user, betslipCustomerSettings, internalToken: token };

      return next();
    } catch (e) {
      throw new UnprocessableEntityException(e.message);
    }
  }
}
