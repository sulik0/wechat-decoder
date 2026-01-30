/**
 * Utility for handling WeChat media files, especially .dat image restoration.
 */

/**
 * Decrypts a WeChat .dat image file by identifying the XOR key.
 * WeChat .dat files are XOR encrypted with a fixed byte.
 * 
 * Target file formats and their header bytes:
 * - JPEG: 0xFF, 0xD8
 * - PNG: 0x89, 0x50
 * - GIF: 0x47, 0x49
 * 
 * @param buffer The .dat file content as a Uint8Array
 * @returns The decrypted file as a Blob with correct MIME type, or null if decryption fails
 */
export const decryptDatImage = (buffer: Uint8Array): { blob: Blob; extension: string } | null => {
  if (buffer.length < 2) return null;

  const firstTwoBytes = buffer.slice(0, 2);
  
  // Headers for common image formats
  const headers = [
    { prefix: [0xFF, 0xD8], extension: 'jpg', mime: 'image/jpeg' },
    { prefix: [0x89, 0x50], extension: 'png', mime: 'image/png' },
    { prefix: [0x47, 0x49], extension: 'gif', mime: 'image/gif' },
  ];

  for (const header of headers) {
    // Calculate XOR key using the first byte
    const key = firstTwoBytes[0] ^ header.prefix[0];
    
    // Verify the key using the second byte
    if ((firstTwoBytes[1] ^ header.prefix[1]) === key) {
      // Key found, decrypt the entire buffer
      const decrypted = new Uint8Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        decrypted[i] = buffer[i] ^ key;
      }
      
      return {
        blob: new Blob([decrypted], { type: header.mime }),
        extension: header.extension
      };
    }
  }

  return null;
};

/**
 * Converts a Silk/AMR voice file to a playable format.
 * Note: Silk decoding typically requires a native library or a more complex WASM module.
 * For now, this is a placeholder for future implementation.
 */
export const processVoiceMessage = async (_buffer: ArrayBuffer): Promise<string> => {
  // TODO: Implement Silk to MP3/WAV conversion
  console.warn('Voice conversion not yet implemented');
  return '';
};
