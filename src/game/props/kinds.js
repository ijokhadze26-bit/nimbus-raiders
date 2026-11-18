// Road-object kinds (update 3 stage 4). To add one: write its module (see index.js for the contract), list
// it here and give src/data/propplan.js a placement rule for it.
import { crane } from './crane.js';
import { dam } from './dam.js';
import { bell } from './bell.js';
import { boulder } from './boulder.js';

export const KIND_LIST = [crane, dam, bell, boulder];
export const KINDS = Object.fromEntries(KIND_LIST.map((k) => [k.kind, k]));
