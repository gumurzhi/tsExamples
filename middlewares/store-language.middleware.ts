import { Injectable, NestMiddleware } from '@nestjs/common';
import { createNamespace, getNamespace, Namespace } from 'cls-hooked';
import { CLS, DEFAULT_CURRENCY_CODE, DEFAULT_LANGUAGE } from '../constants';
import { ExtendedRequest, Next } from '../interfaces';

let session: Namespace;

@Injectable()
export class StoreLanguageMiddleware implements NestMiddleware {
  constructor() {
    session = getNamespace(CLS.languageStorage);
    if (!session) {
      session = createNamespace(CLS.languageStorage);
    }
  }

  public use(request: ExtendedRequest, response: Response, next: Next) {
    session.run(() => {
      const lang = request.user?.languageCode || DEFAULT_LANGUAGE;
      session.set(CLS.lang, lang);
      session.set(CLS.currencyCode, request.user?.currencyCode || DEFAULT_CURRENCY_CODE);
      return next();
    });
  }
}
