import * as faceapi from 'face-api.js';

export async function downloadModels() {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceExpressionNet.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models')
    ]);
    console.log('Face detection models downloaded successfully');
  } catch (error) {
    console.error('Error downloading face detection models:', error);
  }
} 