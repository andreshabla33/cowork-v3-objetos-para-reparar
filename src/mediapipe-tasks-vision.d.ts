declare module '@mediapipe/tasks-vision' {
  export interface BaseOptions {
    modelAssetPath?: string;
    modelAssetBuffer?: Uint8Array;
    delegate?: 'CPU' | 'GPU';
  }

  export interface VisionTaskOptions {
    baseOptions?: BaseOptions;
    runningMode?: 'IMAGE' | 'VIDEO';
  }

  export interface ImageSegmenterOptions extends VisionTaskOptions {
    outputCategoryMask?: boolean;
    outputConfidenceMasks?: boolean;
  }

  export class MPMask {
    getAsFloat32Array(): Float32Array;
    getAsUint8Array(): Uint8Array;
    close(): void;
    readonly width: number;
    readonly height: number;
  }

  export class ImageSegmenterResult {
    categoryMask: MPMask | null;
    confidenceMasks: MPMask[] | null;
    close(): void;
  }

  export class ImageSegmenter {
    static createFromOptions(
      vision: any,
      options: ImageSegmenterOptions
    ): Promise<ImageSegmenter>;
    segmentForVideo(
      image: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
      timestamp: number
    ): ImageSegmenterResult;
    segment(
      image: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
    ): ImageSegmenterResult;
    close(): void;
  }

  export class FilesetResolver {
    static forVisionTasks(wasmPath: string): Promise<any>;
  }
}
