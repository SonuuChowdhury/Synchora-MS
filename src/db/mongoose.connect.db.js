import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const connectDB = async () => {
    try {
        const SynchoraDB = await mongoose.connect(`${process.env.MONGODB_URI}/synchoradb?retryWrites=true&w=majority&appName=Cluster0&connectTimeoutMS=30000`);

        return {
            SynchoraDB,
        };
    } catch (error) {
        console.error("MONGODB connection FAILED", error);
        process.exit(1); // Exit process with failure
    }finally{
        return;
    }
};

// Export the function so it can be called elsewhere
export default connectDB;
