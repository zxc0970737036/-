
import { Expression, GenerationStatus } from './types';

export const DEFAULT_EXPRESSIONS: Expression[] = [
  { id: '1', label: '開心', enLabel: 'happy', isSelected: true, status: GenerationStatus.IDLE },
  { id: '2', label: '尷尬', enLabel: 'embarrassed', isSelected: true, status: GenerationStatus.IDLE },
  { id: '3', label: '生氣', enLabel: 'angry', isSelected: true, status: GenerationStatus.IDLE },
  { id: '4', label: '驚訝', enLabel: 'surprised', isSelected: false, status: GenerationStatus.IDLE },
  { id: '5', label: '害羞', enLabel: 'shy', isSelected: false, status: GenerationStatus.IDLE },
  { id: '6', label: '大笑', enLabel: 'laughing loudly', isSelected: false, status: GenerationStatus.IDLE },
  { id: '7', label: '害怕', enLabel: 'afraid', isSelected: false, status: GenerationStatus.IDLE },
  { id: '8', label: '哭泣', enLabel: 'crying', isSelected: false, status: GenerationStatus.IDLE },
];

export const getSystemInstruction = (bgColor: string) => `You are a professional image variation model specialized in facial expressions and Chroma Key background generation.

CORE RULES:
1. FACIAL EXPRESSION: Modify ONLY the facial expression. 
2. CHROMA KEY BACKGROUND: You MUST replace the entire background with a PURE SOLID COLOR: ${bgColor}.
3. BACKGROUND QUALITY: The background must be 100% flat and uniform. Absolutely NO gradients, NO noise, NO glow, NO shadows, NO anti-aliasing artifacts at the edges, and NO textures.
4. CONSISTENCY: Keep character identity, face proportions, hairstyle, outfit, accessories, art style, lighting direction, and camera angle identical to the source.
5. CLEANLINESS: No text, no watermarks, no overlays.`;

export const getPrompt = (expressionEn: string, bgColor: string) => `[COMMAND: GENERATE_VARIANTS]
- Task: Create a facial expression variant for the provided character.
- Target Expression: ${expressionEn}.
- Background Requirement: SOLID COLOR (${bgColor}). The character must be perfectly isolated on this flat color.
- Preservation: Hairstyle, clothing, art style, and lighting must remain unchanged.
- Output: 320x320 square PNG, clean assets only.`;
