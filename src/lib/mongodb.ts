import { MongoClient, Db } from "mongodb";

/**
 * CampusFleet Polyglot Persistence Layer:
 * MongoDB Telemetry & High-Frequency GPS Breadcrumbs Engine.
 * 
 * Architecture:
 * - PostgreSQL (Supabase): 29 Relational Tables, ACID Seat Booking, RLS, Identity & Billing.
 * - MongoDB: Ephemeral high-velocity GPS telemetry, 24-hour auto-expiring breadcrumbs (TTL).
 * 
 * Zero SQL injection risk: Native BSON parameterization.
 * Zero connection leaks: Cached singleton connection pool for Next.js Serverless.
 */

const uri = process.env.MONGODB_URI || "";
const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
};

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (uri) {
  if (process.env.NODE_ENV === "development") {
    // Preserve connection across HMR (Hot Module Replacement)
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
} else {
  // MONGODB_URI not configured in current environment
  // System will gracefully fall back to in-memory / Redis cache
}

export async function getMongoDb(): Promise<Db | null> {
  if (!clientPromise) {
    return null;
  }
  try {
    const connectedClient = await clientPromise;
    const dbName = process.env.MONGODB_DB_NAME || "campusfleet";
    return connectedClient.db(dbName);
  } catch (err) {
    console.warn("MongoDB connection warning:", (err as Error)?.message || err);
    return null;
  }
}

export interface LiveLocationDocument {
  busId: string;
  tripId?: string;
  driverId?: string;
  driverName?: string;
  busNumber?: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  headingDeg?: number;
  accuracy?: number;
  currentStopId?: string;
  delayMinutes?: number;
  updatedAt: Date;
}

export interface BreadcrumbDocument {
  busId: string;
  tripId?: string;
  driverId?: string;
  driverName?: string;
  busNumber?: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  headingDeg?: number;
  accuracy?: number;
  createdAt: Date;
}

let indexesInitialized = false;

async function ensureIndexes(db: Db): Promise<void> {
  if (indexesInitialized) return;
  try {
    // Unique index on busId for live location upsert
    await db.collection("bus_live_locations").createIndex(
      { busId: 1 },
      { unique: true }
    );

    // TTL Index: automatically delete breadcrumb coordinates older than 24 hours
    // Keeps free-tier MongoDB storage below 50MB indefinitely
    await db.collection("gps_breadcrumbs").createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 86400 }
    );

    // Compound index for fast historical query by bus and time
    await db.collection("gps_breadcrumbs").createIndex(
      { busId: 1, createdAt: -1 }
    );

    indexesInitialized = true;
  } catch (err) {
    console.warn("MongoDB index setup warning:", (err as Error)?.message || err);
  }
}

/**
 * Upsert the latest live location for a bus and driver into MongoDB.
 */
export async function saveLiveLocationToMongo(data: Omit<LiveLocationDocument, "updatedAt">): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;

  try {
    await ensureIndexes(db);
    const now = new Date();

    // 1. Update the single latest position document for this bus
    await db.collection("bus_live_locations").updateOne(
      { busId: data.busId },
      {
        $set: {
          ...data,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    // 2. Append to historical breadcrumb trail (auto-expires in 24h via TTL)
    await db.collection("gps_breadcrumbs").insertOne({
      busId: data.busId,
      tripId: data.tripId,
      driverId: data.driverId,
      driverName: data.driverName,
      busNumber: data.busNumber,
      latitude: data.latitude,
      longitude: data.longitude,
      speedKmh: data.speedKmh || 0,
      headingDeg: data.headingDeg || 0,
      accuracy: data.accuracy,
      createdAt: now,
    });

    return true;
  } catch (err) {
    console.warn("Failed to persist live location to MongoDB:", (err as Error)?.message || err);
    return false;
  }
}

/**
 * Get MongoDB Telemetry cluster metrics and sync status for a vehicle.
 */
export async function getMongoTelemetryStats(busId?: string): Promise<{
  connected: boolean;
  database: string | null;
  liveCollection: string;
  breadcrumbsCollection: string;
  totalActiveBuses: number;
  busBreadcrumbsCount: number;
  lastSyncAt: string | null;
  driverName?: string | null;
  busNumber?: string | null;
}> {
  const db = await getMongoDb();
  if (!db) {
    return {
      connected: false,
      database: null,
      liveCollection: "bus_live_locations",
      breadcrumbsCollection: "gps_breadcrumbs",
      totalActiveBuses: 0,
      busBreadcrumbsCount: 0,
      lastSyncAt: null,
    };
  }

  try {
    const [totalActiveBuses, busBreadcrumbsCount, latestDoc] = await Promise.all([
      db.collection("bus_live_locations").countDocuments().catch(() => 0),
      busId
        ? db.collection("gps_breadcrumbs").countDocuments({ busId }).catch(() => 0)
        : db.collection("gps_breadcrumbs").countDocuments().catch(() => 0),
      busId
        ? db.collection("bus_live_locations").findOne({ busId }, { projection: { _id: 0 } }).catch(() => null)
        : null,
    ]);

    return {
      connected: true,
      database: db.databaseName,
      liveCollection: "bus_live_locations",
      breadcrumbsCollection: "gps_breadcrumbs",
      totalActiveBuses,
      busBreadcrumbsCount,
      lastSyncAt: latestDoc?.updatedAt ? new Date(latestDoc.updatedAt).toISOString() : null,
      driverName: latestDoc?.driverName || null,
      busNumber: latestDoc?.busNumber || null,
    };
  } catch (err) {
    console.warn("Failed to fetch MongoDB telemetry stats:", err);
    return {
      connected: false,
      database: null,
      liveCollection: "bus_live_locations",
      breadcrumbsCollection: "gps_breadcrumbs",
      totalActiveBuses: 0,
      busBreadcrumbsCount: 0,
      lastSyncAt: null,
    };
  }
}

/**
 * Fetch the latest live location for a specific bus from MongoDB.
 */
export async function getLiveLocationFromMongo(busId: string | number): Promise<LiveLocationDocument | null> {
  const db = await getMongoDb();
  if (!db) return null;

  try {
    const trimmedId = String(busId ?? "").trim();
    if (!trimmedId) return null;
    const doc = await db.collection("bus_live_locations").findOne(
      {
        $or: [
          { busId: trimmedId },
          { busId: trimmedId.toLowerCase() },
          { busId: trimmedId.toUpperCase() },
          ...(isNaN(Number(trimmedId)) ? [] : [{ busId: Number(trimmedId) }])
        ]
      },
      { projection: { _id: 0 } }
    );
    return doc as LiveLocationDocument | null;
  } catch (err) {
    console.warn("Failed to read live location from MongoDB:", (err as Error)?.message || err);
    return null;
  }
}

/**
 * Fetch all active buses' latest live locations from MongoDB.
 */
export async function getAllLiveLocationsFromMongo(): Promise<LiveLocationDocument[]> {
  const db = await getMongoDb();
  if (!db) return [];

  try {
    const docs = await db.collection("bus_live_locations")
      .find({}, { projection: { _id: 0 } })
      .toArray();
    return docs as unknown as LiveLocationDocument[];
  } catch (err) {
    console.warn("Failed to read all live locations from MongoDB:", (err as Error)?.message || err);
    return [];
  }
}

/**
 * Fetch recent breadcrumb trail for a bus (e.g. for map polylines).
 */
export async function getBusBreadcrumbsFromMongo(busId: string, limit = 50): Promise<BreadcrumbDocument[]> {
  const db = await getMongoDb();
  if (!db) return [];

  try {
    const docs = await db.collection("gps_breadcrumbs")
      .find({ busId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.reverse() as unknown as BreadcrumbDocument[];
  } catch (err) {
    console.warn("Failed to read breadcrumbs from MongoDB:", (err as Error)?.message || err);
    return [];
  }
}
