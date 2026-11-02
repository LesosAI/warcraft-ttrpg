// Shared with GM recovery so a recorded save awaiting damage is not mistaken
// for an abandoned operation on the same active GM.
export const areaSaveWrites=new Set();
