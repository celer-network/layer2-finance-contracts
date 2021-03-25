### Generate contract input

Use the `l2gen` tool to generate contract inputs from transition proto list

#### Usage examples

- `./l2gen -f pbtxt/example.pbtxt`: generate input to commit block and dispute transition.
- `./l2gen -d2h 1e18`: convert decimal integer to pbtxt hex representation.
- `./l2gen -h2d \x06\xf0\x5b\x59\xd3\xb2\x00\x00`: convert pbtxt hex representation to decimal integer.

#### Transition flags

Use the followings flag to mark invalid transition for testing:

1. invalid root
2. invalid amount
3. invalid signature
4. invalid account id
