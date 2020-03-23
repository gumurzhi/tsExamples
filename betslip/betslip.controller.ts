import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Response,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LoggerService } from '@sportsbook-bff/logger';
import { GetUserData, RunSessionDecorator } from '../../decorators';
import { ExtendedRequest, ExtendedResponse, ListedData } from '../../interfaces';
import { ParseQueryArr, TimestampCheck, ValidatePresencePipe } from '../../pipes';
import { assertEx } from '../../utils';
import { BetslipService } from './betslip.service';
import {
  BetslipUpdateResponse,
  GetBetslipResponseModels,
  PostBetslipRequestModel,
  PostBetslipResponseModel,
} from './models/api';
import { RequestUser, TokenPayload } from '../auth';
import { BetslipCustomerSettingsModel, BetslipSettingsService } from '../betslip-settings';
import { ANONYMOUS_CUSTOMER_ID, DEFAULT_CURRENCY_CODE } from '../../constants';
import { CheckUserGuard } from '../../guards';
import { prepareListResponse, SerializerInterceptor } from '@sportsbook/shared_components_be';
import { BetslipSerializedModel } from '@sportsbook/serializer/lib/models/BetslipSerializedModel';

@ApiTags('BETSLIP')
@Controller('/betslip')
export class BetslipController {
  constructor(
    private readonly log: LoggerService,
    private service: BetslipService,
    private betslipCustomerSettingsService: BetslipSettingsService,
  ) {
    this.log.silly('CREATED BetslipController');
  }

  @ApiBearerAuth()
  @ApiCreatedResponse({ type: PostBetslipResponseModel })
  @Post('/')
  @UseGuards(CheckUserGuard)
  @ApiBody({ type: PostBetslipRequestModel })
  @RunSessionDecorator
  public async setMyBetslip(
    @Req() request: ExtendedRequest,
    @Body() payload: PostBetslipRequestModel,
    @GetUserData() user: TokenPayload,
  ): Promise<PostBetslipResponseModel> {
    assertEx(payload && Array.isArray(payload.selectionIds), 'Wrong data format', HttpStatus.BAD_REQUEST);
    return this.service.setCustomerBetslip(payload, user.customerId, user.currencyCode || DEFAULT_CURRENCY_CODE);
  }

  @ApiBearerAuth()
  @ApiOkResponse({ type: GetBetslipResponseModels, isArray: true })
  @UseGuards(CheckUserGuard)
  @Get('/')
  public getMyBetslip(
    @Req() request: ExtendedRequest,
    @GetUserData('customerId') customerId: number,
  ): Promise<GetBetslipResponseModels[]> {
    return this.service.getMyBetslip(customerId);
  }

  @ApiBearerAuth()
  @ApiQuery({ name: 'selectionsIds', type: [String], required: true })
  @ApiOkResponse({ type: GetBetslipResponseModels, isArray: true })
  @UseInterceptors(new SerializerInterceptor(BetslipSerializedModel))
  @Get('/anonymous')
  public async getAnonymousBetslip(
    @Query('selectionsIds', ValidatePresencePipe, ParseQueryArr) selectionsIds: string[],
  ): Promise<ListedData<GetBetslipResponseModels>> {
    const data = await this.service.getAnonymousBetslip(selectionsIds);
    return prepareListResponse(data);
  }

  @ApiBearerAuth()
  @ApiQuery({ name: 'UPDATE_TIMESTAMP', type: Number, required: true })
  @UseGuards(CheckUserGuard)
  @ApiOkResponse({ type: BetslipUpdateResponse, isArray: true })
  @Get('/updates')
  public getMyUpdates(
    @GetUserData('customerId') customerId: number,
    @Query('UPDATE_TIMESTAMP', ValidatePresencePipe, TimestampCheck, ParseIntPipe) UPDATE_TIMESTAMP: number,
  ): Promise<BetslipUpdateResponse[]> {
    return this.service.getBetslipUpdates(customerId, UPDATE_TIMESTAMP) as Promise<BetslipUpdateResponse[]>;
  }

  @ApiBearerAuth()
  @ApiQuery({ name: 'UPDATE_TIMESTAMP', type: Number, required: true })
  @ApiQuery({ name: 'selectionIds', type: [String], required: true })
  @ApiOkResponse({ type: BetslipUpdateResponse, isArray: true })
  @Get('/updates/anonymous')
  public getAnonymousUpdates(
    @Query('UPDATE_TIMESTAMP', ValidatePresencePipe, TimestampCheck, ParseIntPipe) UPDATE_TIMESTAMP: number,
    @Query('selectionIds', ValidatePresencePipe, ParseQueryArr) selectionIds: string[],
  ): Promise<BetslipUpdateResponse[]> {
    return this.service.getBetslipUpdatesForAnonymous(selectionIds, UPDATE_TIMESTAMP) as Promise<
      BetslipUpdateResponse[]
    >;
  }

  @ApiQuery({ name: 'token', required: true, type: 'string' })
  @ApiOkResponse()
  @ApiQuery({ name: 'timestamp', type: Number, required: true })
  @UseGuards(CheckUserGuard)
  @Get('/updates/sse')
  public async getUpdateStream(
    @Req() req: ExtendedRequest,
    @Response() res: ExtendedResponse,
    @GetUserData('customerId') customerId: number,
    //    @Query('timestamp', ParseIntPipe) timestamp: number,
  ): Promise<void> {
    // if (timestamp) {
    //   assertEx(
    //     timestamp.toString().length > LONG_INT_LENGTH,
    //     'UPDATE_TIMESTAMP should be long Int',
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }
    /** todo uncomment this after UI support */
    assertEx(customerId !== ANONYMOUS_CUSTOMER_ID, 'Only logged in users can get updates', HttpStatus.FORBIDDEN);
    return this.service.getStreamUpdates(customerId, undefined, res.res);
  }

  @ApiBearerAuth()
  @Get('/customer-settings')
  @ApiOkResponse({
    type: BetslipCustomerSettingsModel,
    description: '0 - Deny all changed odds (default value), 1 - Accept all changed odds, 2 - Accept only better odds ',
  })
  public getBetslipCustomerSettings(@GetUserData() user: RequestUser): BetslipCustomerSettingsModel {
    return user.betslipCustomerSettings;
  }

  @ApiBearerAuth()
  @Post('/customer-settings')
  @UseGuards(CheckUserGuard)
  @ApiBody({ type: BetslipCustomerSettingsModel })
  @ApiOkResponse({
    type: BetslipCustomerSettingsModel,
    description: '0 - deny all changed odds, 1 - allow all changed odds, 2 - Accept only better odds ',
  })
  @RunSessionDecorator
  public setBetslipCustomerSettings(
    @GetUserData('customerId') customerId: number,
    @Body() payload: BetslipCustomerSettingsModel,
  ): Promise<BetslipCustomerSettingsModel> {
    return this.betslipCustomerSettingsService.setBetslipCustomerSettings(customerId, payload);
  }

  @ApiBearerAuth()
  @Delete('/')
  @UseGuards(CheckUserGuard)
  @ApiOkResponse({ type: Boolean })
  public clearCustomerBetslip(@GetUserData() user: RequestUser): Promise<boolean> {
    return this.service.clearAll(user.customerId, user.internalToken);
  }
}
