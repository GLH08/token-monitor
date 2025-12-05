FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the React app
RUN npm run build

# Install a simple static server
RUN npm install -g serve

EXPOSE 5173

# Serve the built app
CMD ["serve", "-s", "dist", "-l", "5173"]
