FROM node:20-alpine AS base
WORKDIR /app
# vips + vips-heif give sharp real HEIC/HEIF decode via libheif -- sharp's
# own prebuilt npm binary deliberately ships WITHOUT heif support (HEVC
# patent licensing), so this only works if sharp is built from source
# against this system libvips instead (see SHARP_FORCE_GLOBAL_LIBVIPS below).
RUN apk add --no-cache python3 make g++ curl openssl ffmpeg vips vips-cpp vips-heif exiftool

FROM base AS deps
COPY package*.json ./
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1
# node-gyp's generated Makefile doesn't inherit the compiler's own default
# C++ dialect -- without an explicit override it lands on something older
# than C++17, which node-addon-api's headers require (std::string_view,
# std::void_t, `if constexpr`, ...). Confirmed needed live: the build fails
# on exactly these symbols without this.
ENV CXXFLAGS="-std=c++17"
# vips-dev/pkgconfig are only needed while sharp compiles against the system
# libvips above -- removed again right after so the image doesn't carry
# headers/build tooling it'll never use at runtime.
RUN apk add --no-cache --virtual .sharp-build-deps vips-dev pkgconfig \
 && npm install --only=production \
 && apk del .sharp-build-deps

FROM base AS dev-deps
COPY package*.json ./
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1
ENV CXXFLAGS="-std=c++17"
RUN apk add --no-cache --virtual .sharp-build-deps vips-dev pkgconfig \
 && npm install \
 && apk del .sharp-build-deps

FROM dev-deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package*.json ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
