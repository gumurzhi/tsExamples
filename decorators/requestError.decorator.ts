import { assertEx, logger } from '../utils';

export const RequestErrorDecorator = (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
  const fn = descriptor.value;
  descriptor.value = async function(...args: any[]) {
    try {
      return await fn.apply(this, args);
    } catch (err) {
      logger.error('RequestErrorDecorator got error: %j', JSON.stringify(err.response?.data));
      logger.error('RequestErrorDecorator got error: %j', JSON.stringify(err));
      if (!err.response) {
        assertEx(!err, err.message);
      }
      assertEx(
        !err,
        err.response.data && err.response.data.error ? err.response.data.error : err.message,
        err.response.status,
      );
    }
  };
  return descriptor;
};
