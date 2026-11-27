import { IsIn, IsOptional } from 'class-validator';

/**
 * `kind` picks what GET /templates returns. Absent means step recordings only: extension builds from before Smart
 * Templates were stored here read every row as a recording, so they must never be handed a Smart Template.
 */
export class ListTemplatesQueryDto {
  @IsOptional()
  @IsIn(['recording', 'smart', 'all'])
  kind?: 'recording' | 'smart' | 'all';
}
