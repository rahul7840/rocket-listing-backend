import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ListingGeneratorService } from './listing-generator.service';
import { GenerateListingDto } from './dto/generate-listing.dto';
import { ListingFieldsResponse } from './dto/listing-fields.response';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Listing Generator')
@Controller('listing-generator')
// Each call is a paid AI request: only a signed-in Rocket Listing user may make one. An extension build that does
// not send the token gets 401 and fills with the recorded values, as it does whenever the generator is unavailable.
@UseGuards(JwtAuthGuard)
export class ListingGeneratorController {
  constructor(
    private readonly listingGeneratorService: ListingGeneratorService,
  ) {}

  @Post('generate')
  @ApiOperation({
    summary:
      'Generate listing fields (product name, description, SKUs) from a recording',
  })
  @ApiResponse({ status: 201, type: ListingFieldsResponse })
  generate(@Body() dto: GenerateListingDto): Promise<ListingFieldsResponse> {
    return this.listingGeneratorService.generate(dto);
  }
}
