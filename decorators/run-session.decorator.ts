import { createNamespace, getNamespace, Namespace } from 'cls-hooked';
import { CLS, DEFAULT_LANGUAGE } from '../constants';

let session: Namespace;
session = getNamespace(CLS.languageStorage);
if (!session) {
  session = createNamespace(CLS.languageStorage);
}

export const RunSessionDecorator = (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
  const fn = descriptor.value;
  descriptor.value = function(...args: any[]) {
    return new Promise((resolve, reject) => {
      session.run(() => {
        const lang = args[0].raw?.user?.languageCode || DEFAULT_LANGUAGE;
        session.set(CLS.lang, lang);
        fn.apply(this, args)
          .then(resolve)
          .catch(reject);
      });
    });
  };

  return descriptor;
};
