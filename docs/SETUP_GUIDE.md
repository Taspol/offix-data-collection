# Complete Setup Guide

Step-by-step guide to set up the Multi-View Posture Data Collection Platform.

## Prerequisites

### Required Software

- **Node.js** 18+ and npm/yarn
- **PostgreSQL** 14+
- **Git**
- **Code Editor** (VS Code recommended)

### Cloud Services (Choose One)

**Option A: Supabase (Recommended for beginners)**
- Free tier available
- Includes PostgreSQL + Storage
- Sign up at: https://supabase.com

**Option B: AWS**
- Requires credit card
- Use RDS for PostgreSQL
- Use S3 for storage
- More complex but more control

## Step 1: Clone or Setup Project

```bash
# Navigate to your workspace
cd /Users/Taspol/Documents/OFFIX/offix-lab/data_collection

# Check structure
ls -la
# Should see: backend/, frontend/, database-schema.sql, etc.
```

## Step 2: Database Setup

### Option A: Using Supabase Database

1. **Create Supabase Project**
   - Go to https://supabase.com
   - Create new project
   - Wait for database to provision (~2 minutes)

2. **Get Connection Info**
   - Go to Settings > Database
   - Copy connection string

3. **Run Schema**
   - Go to SQL Editor in Supabase dashboard
   - Copy contents of `database-schema.sql`
   - Paste and execute

### Option B: Using Local PostgreSQL

1. **Install PostgreSQL**
   ```bash
   # macOS
   brew install postgresql@14
   brew services start postgresql@14
   ```

2. **Create Database**
   ```bash
   createdb posture_data
   ```

3. **Run Schema**
   ```bash
   psql posture_data < database-schema.sql
   ```

4. **Verify Tables**
   ```bash
   psql posture_data
   # In psql:
   \dt
   # Should see: sessions, devices, recordings, posture_steps, sync_events
   ```

## Step 3: Storage Setup

### Option A: Using Supabase Storage

1. **Create Storage Bucket**
   - In Supabase dashboard, go to Storage
   - Click "New Bucket"
   - Name: `posture-videos`
   - Privacy: Private (recommended)
   - Click Create

2. **Configure Bucket Policies**
   - Click on bucket > Policies
   - Add policy for authenticated uploads:
   ```sql
   CREATE POLICY "Allow uploads"
   ON storage.objects
   FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'posture-videos');
   ```

3. **Get Credentials**
   - Settings > API
   - Copy:
     - Project URL
     - Service Role Key (keep secret!)

### Option B: Using AWS S3

1. **Create S3 Bucket**
   ```bash
   aws s3 mb s3://your-posture-videos
   ```

2. **Configure CORS**
   - Create file `cors.json`:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```
   - Apply CORS:
   ```bash
   aws s3api put-bucket-cors --bucket your-posture-videos --cors-configuration file://cors.json
   ```

3. **Create IAM User**
   - Go to IAM > Users > Create User
   - Attach policy: AmazonS3FullAccess (or custom policy)
   - Save Access Key ID and Secret Access Key

## Step 4: Backend Setup

```bash
cd backend
```

### 4.1 Install Dependencies

```bash
npm install
```

### 4.2 Configure Environment

```bash
cp .env.example .env
```

Edit `.env` file:

#### For Supabase:
```bash
# Database (from Supabase connection string)
DATABASE_HOST=db.xxxxx.supabase.co
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your-password
DATABASE_NAME=postgres

# Storage
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_BUCKET=posture-videos

# Server
PORT=3001
CORS_ORIGIN=http://localhost:3000
UPLOAD_URL_EXPIRY=300
```

#### For AWS:
```bash
# Database (local or RDS)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your-password
DATABASE_NAME=posture_data

# Storage
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=your-posture-videos

# Server
PORT=3001
CORS_ORIGIN=http://localhost:3000
UPLOAD_URL_EXPIRY=300
```

### 4.3 Start Backend

```bash
npm run start:dev
```

**Expected output:**
```
[Nest] INFO  [NestFactory] Starting Nest application...
[Nest] INFO  [InstanceLoader] AppModule dependencies initialized
🚀 Server is running on: http://localhost:3001
📡 WebSocket server is ready
```

### 4.4 Test Backend

Open browser to http://localhost:3001
- Should see: Cannot GET /

Test API:
```bash
curl http://localhost:3001/api/postures
# Should return list of posture steps
```

## Step 5: Frontend Setup

Open new terminal:

```bash
cd frontend
```

### 5.1 Install Dependencies

```bash
npm install
```

### 5.2 Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` (default should work):
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

### 5.3 Start Frontend

```bash
npm run dev
```

**Expected output:**
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

### 5.4 Test Frontend

Open browser to http://localhost:3000

You should see the home page with Desktop and Mobile options.

## Step 6: Test Complete Flow

### 6.1 Desktop Session

1. Open http://localhost:3000 in desktop browser (Chrome recommended)
2. Click "Start as Desktop"
3. Should see:
   - Session code (e.g., ABC12345)
   - QR code
   - Camera preview
   - Status: "Waiting for mobile..."

### 6.2 Mobile Join

**Option A: Real Mobile Device**
1. Connect mobile to same WiFi network
2. Open http://YOUR_COMPUTER_IP:3000 on mobile
3. Click "Join as Mobile"
4. Enter session code from desktop

**Option B: Mobile Simulator**
1. Open Chrome DevTools (F12)
2. Click device toolbar (Ctrl+Shift+M)
3. Select mobile device (e.g., iPhone 12)
4. Navigate to http://localhost:3000
5. Click "Join as Mobile"
6. Enter session code

### 6.3 Record First Posture

1. Wait for both devices to show "Connected"
2. On desktop, click "Start Recording"
3. You'll see:
   - Countdown: 3, 2, 1...
   - Both cameras recording simultaneously
   - Recording indicator with timer
4. Recording stops automatically after 10 seconds
5. Videos upload automatically
6. Move to next posture step

### 6.4 Verify Upload

Check database:
```bash
psql posture_data
```

```sql
-- Check session
SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1;

-- Check recordings
SELECT 
  session_id,
  device_type,
  view_type,
  posture_label,
  upload_status,
  file_size_bytes
FROM recordings
ORDER BY created_at DESC;
```

Check storage:
- **Supabase**: Dashboard > Storage > posture-videos
- **S3**: AWS Console > S3 > your-bucket

## Step 7: Troubleshooting

### Backend Won't Start

**Error: Database connection failed**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:**
- Check PostgreSQL is running: `brew services list`
- Verify database credentials in `.env`
- Test connection: `psql -U postgres -d posture_data`

**Error: Port 3001 already in use**
```
Error: listen EADDRINUSE: address already in use :::3001
```
**Solution:**
- Kill process on port 3001:
  ```bash
  lsof -ti:3001 | xargs kill -9
  ```
- Or change PORT in `.env`

### Frontend Won't Start

**Error: Port 3000 already in use**
```
Error: listen EADDRINUSE: address already in use :::3000
```
**Solution:**
```bash
lsof -ti:3000 | xargs kill -9
```

**Error: Cannot connect to backend**
- Check backend is running on port 3001
- Check CORS settings in backend
- Verify `NEXT_PUBLIC_API_URL` in `.env.local`

### Camera Not Working

**Error: "Permission denied" or "Not allowed"**
**Solution:**
- Allow camera permissions in browser
- Chrome: Settings > Privacy and Security > Site Settings > Camera
- Must use HTTPS in production (HTTP ok for localhost)

**No camera preview**
**Solution:**
- Check browser console for errors
- Try different browser (Chrome/Firefox recommended)
- Verify camera is not used by another app

### WebSocket Connection Failed

**Error in console: "WebSocket connection failed"**
**Solution:**
- Check backend is running
- Verify `NEXT_PUBLIC_WS_URL` in frontend `.env.local`
- Check firewall/antivirus not blocking WebSocket
- Try different port in backend

### Upload Failed

**Error: "Upload failed" or "403 Forbidden"**

**Supabase:**
- Check bucket exists: Dashboard > Storage
- Verify bucket policies allow uploads
- Check SUPABASE_KEY is service role key (not anon key)

**AWS S3:**
- Verify AWS credentials in `.env`
- Check S3 bucket exists: `aws s3 ls`
- Verify CORS configuration
- Check IAM permissions

### Synchronization Issues

**Videos don't start at same time**
- Network latency may cause 50-200ms difference (normal)
- Check system clocks on both devices
- Check network conditions

**Recording stops too early/late**
- Verify posture step durations in database
- Check countdown settings
- Look at browser console logs for timing

### Mobile Can't Join

**Error: "Session not found"**
- Verify session code is correct (case-sensitive)
- Check desktop session is still active
- Verify mobile and desktop on same network (if using local IP)

**Can't access localhost on mobile**
- Use computer's local IP instead: http://192.168.1.x:3000
- Find local IP:
  ```bash
  # macOS
  ifconfig | grep "inet " | grep -v 127.0.0.1
  ```

## Step 8: Production Deployment

### Backend Deployment

**Option 1: Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
cd backend
railway init
railway up
```

**Option 2: Render**
- Connect GitHub repo
- Set environment variables
- Deploy

### Frontend Deployment

**Vercel (Recommended):**
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd frontend
vercel
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_API_URL`: Your backend URL
- `NEXT_PUBLIC_WS_URL`: Your backend URL

### Update CORS

After deployment, update backend `.env`:
```bash
CORS_ORIGIN=https://your-frontend.vercel.app
```

## Step 9: Usage Workflow

### Typical Session Flow

1. **Setup**
   - Researcher opens desktop app
   - Clicks "Start as Desktop"
   - Shows QR code to participant

2. **Participant Joins**
   - Scans QR with phone
   - Positions phone for side view
   - Both cameras show preview

3. **Recording**
   - Researcher starts first posture
   - Countdown: 3, 2, 1...
   - Both cameras record 10 seconds
   - Auto-upload

4. **Next Postures**
   - Progress through all 6 postures
   - 10 seconds each
   - Total: ~2-3 minutes

5. **Complete**
   - Session marked complete
   - 12 videos uploaded (6 front + 6 side)
   - Data ready for analysis

## Step 10: Data Export

### Export Recordings Metadata

```sql
-- Export as CSV
\copy (SELECT session_id, device_type, view_type, posture_label, storage_path, file_size_bytes, start_timestamp FROM recordings WHERE session_id = 'your-session-id' ORDER BY created_at) TO '/tmp/recordings.csv' CSV HEADER;
```

### Download Videos

**Supabase:**
```typescript
// Generate download URL in backend
const url = await storageService.getDownloadUrl(storagePath);
```

**AWS S3:**
```bash
# Download all videos for a session
aws s3 sync s3://your-bucket/sessions/session-id/ ./downloads/
```

## Next Steps

1. **Add Authentication**: Implement user login (NextAuth.js)
2. **Add Data Export**: Bulk download tool for researchers
3. **Improve UI**: Add real-time thumbnails, progress indicators
4. **Add Analytics**: Track session statistics, completion rates
5. **Mobile App**: Convert to native app for better camera control

## Support

If you encounter issues:

1. Check browser console (F12)
2. Check backend logs
3. Review database with `psql`
4. Check storage bucket in dashboard
5. Review documentation in `/docs` folder

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Next.js Documentation](https://nextjs.org/docs)
- [Socket.io Documentation](https://socket.io/docs/v4/)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Supabase Documentation](https://supabase.com/docs)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)

---

**Congratulations!** Your posture data collection platform is now ready to use. 🎉
