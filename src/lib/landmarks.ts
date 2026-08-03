/**
 * Landmark index constants and drawing topology for the two MediaPipe models.
 *
 * Note on sides: pose landmark names are *anatomical* — `POSE.leftShoulder` is
 * the shoulder on the person's own left, regardless of how the video is
 * mirrored on screen. Mirroring is a display concern only (see drawing.ts).
 */

export const POSE = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

export const HAND = {
  wrist: 0,
  thumbCmc: 1,
  thumbMcp: 2,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexDip: 7,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleDip: 11,
  middleTip: 12,
  ringMcp: 13,
  ringPip: 14,
  ringDip: 15,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyPip: 18,
  pinkyDip: 19,
  pinkyTip: 20,
} as const;

/** Per-side landmark lookup so metrics can be written once. */
export function poseSide(side: 'left' | 'right') {
  const L = side === 'left';
  return {
    shoulder: L ? POSE.leftShoulder : POSE.rightShoulder,
    elbow: L ? POSE.leftElbow : POSE.rightElbow,
    wrist: L ? POSE.leftWrist : POSE.rightWrist,
    index: L ? POSE.leftIndex : POSE.rightIndex,
    hip: L ? POSE.leftHip : POSE.rightHip,
    knee: L ? POSE.leftKnee : POSE.rightKnee,
    ankle: L ? POSE.leftAnkle : POSE.rightAnkle,
    heel: L ? POSE.leftHeel : POSE.rightHeel,
    foot: L ? POSE.leftFoot : POSE.rightFoot,
    otherShoulder: L ? POSE.rightShoulder : POSE.leftShoulder,
    otherHip: L ? POSE.rightHip : POSE.leftHip,
  };
}

export type Segment = 'torso' | 'arm-left' | 'arm-right' | 'leg-left' | 'leg-right' | 'head';

/** Skeleton edges, grouped so each limb can be colored independently. */
export const POSE_EDGES: [number, number, Segment][] = [
  [POSE.leftShoulder, POSE.rightShoulder, 'torso'],
  [POSE.leftShoulder, POSE.leftHip, 'torso'],
  [POSE.rightShoulder, POSE.rightHip, 'torso'],
  [POSE.leftHip, POSE.rightHip, 'torso'],

  [POSE.leftShoulder, POSE.leftElbow, 'arm-left'],
  [POSE.leftElbow, POSE.leftWrist, 'arm-left'],
  [POSE.leftWrist, POSE.leftIndex, 'arm-left'],
  [POSE.leftWrist, POSE.leftPinky, 'arm-left'],
  [POSE.leftWrist, POSE.leftThumb, 'arm-left'],

  [POSE.rightShoulder, POSE.rightElbow, 'arm-right'],
  [POSE.rightElbow, POSE.rightWrist, 'arm-right'],
  [POSE.rightWrist, POSE.rightIndex, 'arm-right'],
  [POSE.rightWrist, POSE.rightPinky, 'arm-right'],
  [POSE.rightWrist, POSE.rightThumb, 'arm-right'],

  [POSE.leftHip, POSE.leftKnee, 'leg-left'],
  [POSE.leftKnee, POSE.leftAnkle, 'leg-left'],
  [POSE.leftAnkle, POSE.leftHeel, 'leg-left'],
  [POSE.leftHeel, POSE.leftFoot, 'leg-left'],
  [POSE.leftAnkle, POSE.leftFoot, 'leg-left'],

  [POSE.rightHip, POSE.rightKnee, 'leg-right'],
  [POSE.rightKnee, POSE.rightAnkle, 'leg-right'],
  [POSE.rightAnkle, POSE.rightHeel, 'leg-right'],
  [POSE.rightHeel, POSE.rightFoot, 'leg-right'],
  [POSE.rightAnkle, POSE.rightFoot, 'leg-right'],

  [POSE.leftEar, POSE.leftEye, 'head'],
  [POSE.leftEye, POSE.nose, 'head'],
  [POSE.nose, POSE.rightEye, 'head'],
  [POSE.rightEye, POSE.rightEar, 'head'],
];

export type Digit = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky' | 'palm';

export const HAND_EDGES: [number, number, Digit][] = [
  [0, 1, 'thumb'],
  [1, 2, 'thumb'],
  [2, 3, 'thumb'],
  [3, 4, 'thumb'],
  [0, 5, 'palm'],
  [5, 6, 'index'],
  [6, 7, 'index'],
  [7, 8, 'index'],
  [5, 9, 'palm'],
  [9, 10, 'middle'],
  [10, 11, 'middle'],
  [11, 12, 'middle'],
  [9, 13, 'palm'],
  [13, 14, 'ring'],
  [14, 15, 'ring'],
  [15, 16, 'ring'],
  [13, 17, 'palm'],
  [17, 18, 'pinky'],
  [18, 19, 'pinky'],
  [19, 20, 'pinky'],
  [0, 17, 'palm'],
];

/** Human-readable names, used by the landmark inspector in the Motion page. */
export const POSE_NAMES: Record<number, string> = {
  0: 'nose',
  1: 'left eye (inner)',
  2: 'left eye',
  3: 'left eye (outer)',
  4: 'right eye (inner)',
  5: 'right eye',
  6: 'right eye (outer)',
  7: 'left ear',
  8: 'right ear',
  9: 'mouth (left)',
  10: 'mouth (right)',
  11: 'left shoulder',
  12: 'right shoulder',
  13: 'left elbow',
  14: 'right elbow',
  15: 'left wrist',
  16: 'right wrist',
  17: 'left pinky',
  18: 'right pinky',
  19: 'left index',
  20: 'right index',
  21: 'left thumb',
  22: 'right thumb',
  23: 'left hip',
  24: 'right hip',
  25: 'left knee',
  26: 'right knee',
  27: 'left ankle',
  28: 'right ankle',
  29: 'left heel',
  30: 'right heel',
  31: 'left foot',
  32: 'right foot',
};

export const HAND_NAMES: Record<number, string> = {
  0: 'wrist',
  1: 'thumb CMC',
  2: 'thumb MCP',
  3: 'thumb IP',
  4: 'thumb tip',
  5: 'index MCP',
  6: 'index PIP',
  7: 'index DIP',
  8: 'index tip',
  9: 'middle MCP',
  10: 'middle PIP',
  11: 'middle DIP',
  12: 'middle tip',
  13: 'ring MCP',
  14: 'ring PIP',
  15: 'ring DIP',
  16: 'ring tip',
  17: 'pinky MCP',
  18: 'pinky PIP',
  19: 'pinky DIP',
  20: 'pinky tip',
};
