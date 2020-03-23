import { createParamDecorator } from '@nestjs/common';
import { GetUserData as GetUserDataFn } from '@sportsbook/shared_components_be';

export const GetUserData = createParamDecorator(GetUserDataFn);
