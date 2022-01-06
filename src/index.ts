import dotenv from "dotenv";
import * as zmq from "zeromq";
import axios from "axios";
import { SearchResponseDto } from "./interfaces/search-response-dto";
import { Video } from "./interfaces/video";

dotenv.config();

const pipedApiBaseUrl = process.env.PIPED_API ?? "https://pipedapi.kavin.rocks";
const backendApiBaseUrl =
  process.env.BACKEND_API ?? "http://localhost:4000/api";
const zmqSocketAddr = process.env.ZMQ_ADDR ?? "tcp://127.0.0.1:4200";

const pipedInstance = axios.create({
  baseURL: pipedApiBaseUrl,
});

const backendInstance = axios.create({
  baseURL: backendApiBaseUrl,
});

const run = async () => {
  const sock = new zmq.Pull();

  sock.connect(zmqSocketAddr);
  console.log("connected to socket, waiting for jobs");

  let mostRelevant: Video;
  for await (const msg of sock) {
    const decoded = msg.toString();
    const [objectId, title] = decoded.split(",");
    if (title === undefined || title.length === 0) {
      continue;
    }
    console.log(objectId, title);

    try {
      const {
        data: { items },
      } = await pipedInstance.get<SearchResponseDto>("/search", {
        params: {
          filter: "videos",
          q: title,
        },
      });
      if (items.length === 0) {
        continue;
      }

      mostRelevant = items[0];
    } catch (err) {
      console.error(err);
      continue;
    }

    try {
      console.log(mostRelevant.title, mostRelevant.url);
      await backendInstance.put(`/request/${objectId}`, {
        details: {
          title: mostRelevant.title,
          url: `https://youtube.com${mostRelevant.url}`,
        },
      });
    } catch (e) {
      console.error("update-error", e);
    }
  }
};

run();
