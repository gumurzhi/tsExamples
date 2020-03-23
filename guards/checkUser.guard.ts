import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ANONYMOUS_CUSTOMER_ID } from '../constants';

@Injectable()
export class CheckUserGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    let request = context.switchToHttp().getRequest();
    request = request.raw || request;
    const { user } = request;
    // tslint:disable-next-line:triple-equals
    if (!Boolean(user) || user.customerId == ANONYMOUS_CUSTOMER_ID) {
      throw new HttpException('Only logged in users allowed', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
