import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/models/user.model';
import { AutopayService } from './autopay.service';
import { CreateAutopayDto, VerifyAutopayDto } from './dto/autopay.dto';
import { CreateOrderDto, VerifyPaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@ApiTags('payment-gateway')
@Controller('payment-gateway')
export class PaymentGatewayController {
  constructor(
    private readonly autopay: AutopayService,
    private readonly razorpayWebhook: RazorpayWebhookService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('pricing')
  @ApiOperation({ summary: 'Purchasable plans and prices (paise)' })
  pricing() {
    return this.payments.getPricing();
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start a checkout: create a Razorpay order' })
  createOrder(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
    return this.payments.createOrder(user.userId, dto);
  }

  @Post('verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm a Checkout result and activate the plan',
  })
  verify(@CurrentUser() user: User, @Body() dto: VerifyPaymentDto) {
    return this.payments.verifyPayment(user.userId, dto);
  }

  @Get('payments/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The signed-in user's payment history" })
  myPayments(@CurrentUser() user: User) {
    return this.payments.listForUser(user.userId);
  }

  @Post('autopay')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Optional autopay after buying a plan: create the Razorpay subscription',
  })
  startAutopay(@CurrentUser() user: User, @Body() dto: CreateAutopayDto) {
    return this.autopay.start(user.userId, dto);
  }

  @Post('autopay/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm the autopay approval from Checkout' })
  verifyAutopay(@CurrentUser() user: User, @Body() dto: VerifyAutopayDto) {
    return this.autopay.verify(user.userId, dto);
  }

  @Get('autopay/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The signed-in user's autopay, or null" })
  myAutopay(@CurrentUser() user: User) {
    return this.autopay.mine(user.userId);
  }

  @Post('autopay/cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Turn autopay off; paid access stays until it ends' })
  cancelAutopay(@CurrentUser() user: User) {
    return this.autopay.cancel(user.userId);
  }

  /**
   * Set this URL in Razorpay Dashboard > Settings > Webhooks:
   *   https://<host>/api/payment-gateway/razorpay/webhook
   * Public on purpose - authenticity comes from the signature, not a JWT.
   */
  @Post('razorpay/webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay webhook receiver (called by Razorpay)' })
  @ApiHeader({ name: 'x-razorpay-signature', required: true })
  @ApiHeader({ name: 'x-razorpay-event-id', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      example: {
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_123' } } },
      },
    },
  })
  async razorpay(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ) {
    if (!req.rawBody) throw new BadRequestException('Raw body unavailable');
    const { duplicate } = await this.razorpayWebhook.handle(
      req.rawBody,
      signature,
      eventId,
    );
    return { received: true, duplicate };
  }
}
