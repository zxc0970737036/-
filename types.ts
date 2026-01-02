
export enum GenerationStatus {
  IDLE = 'IDLE',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface Expression {
  id: string;
  label: string;
  enLabel: string;
  isSelected: boolean;
  status: GenerationStatus;
  resultUrl?: string;
  error?: string;
}

export interface AppState {
  sourceImage: string | null;
  sourceFileName: string;
  expressions: Expression[];
  isGenerating: boolean;
  currentIndex: number;
}
