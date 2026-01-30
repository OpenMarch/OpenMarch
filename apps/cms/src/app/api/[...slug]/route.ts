import { getPayload } from "payload";
import config from "@payload-config";

export const GET = getPayload(config).requestHandler;
export const POST = getPayload(config).requestHandler;
export const PUT = getPayload(config).requestHandler;
export const PATCH = getPayload(config).requestHandler;
export const DELETE = getPayload(config).requestHandler;
