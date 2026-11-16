import { MongoClient } from "mongodb";

let clientPromise;

export function collection(name) {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI ist nicht gesetzt.");
  if (!clientPromise) clientPromise = new MongoClient(process.env.MONGODB_URI).connect();
  return clientPromise.then((client) => client.db().collection(name));
}
