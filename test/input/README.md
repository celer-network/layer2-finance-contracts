### Generate contract input

Use the `l2gen` tool to generate contract inputs from transition proto list

#### Usage examples

- `./l2gen -f pbtxt/example.pbtxt`: generate input to commit block and dispute transition.
- `./l2gen -d2h 1e18`: convert decimal integer to pbtxt hex representation.
- `./l2gen -h2d \x06\xf0\x5b\x59\xd3\xb2\x00\x00`: convert pbtxt hex representation to decimal integer.

#### Transition flags

Use the followings flag to mark transition for testing:

1. generate dispute data 
2. generate invalid root and dispute data
3. generate invalid signature and dispute data
4. generate invalid account id and dispute data
99. last transition of a block
