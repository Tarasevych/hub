/** Build-time STAGING composition: all 11 directory drivers, but NOT a live route.
 * An authorized runtime must still inject this into M8 workspace after M6 policy,
 * M4 account scoping, production secrets, real E2E and release-gate acceptance.
 */
import {GoogleDriveDirectory,GraphDirectory,DropboxDirectory,BoxDirectory,GithubDirectory,PCloudDirectory} from './cloud-m8-directory';
import {NextcloudDirectory,S3CompatibleDirectory} from './cloud-m9-directory';
import type {DirectoryListing,GraphDriveResolver,GithubScopeResolver,PCloudRegionResolver} from './cloud-m8-directory';
import type {CloudTokenResolver,Fetcher} from './cloud-overdracht-adapters';
import type {NextcloudConnectionResolver,TrustedEgressPolicy,S3ConnectionResolver} from './cloud-overdracht-m3-providers';
import type {B2Credentials} from './cloud-m5-backblaze';
export type CloudM9Resolvers={token:CloudTokenResolver;graphDrive:GraphDriveResolver;githubScope:GithubScopeResolver;
 pcloudRegion:PCloudRegionResolver;nextcloud:NextcloudConnectionResolver;egress:TrustedEgressPolicy;
 awsS3:S3ConnectionResolver;backblazeB2:B2Credentials;http?:Fetcher};
export function createCloudM9DirectoryDrivers(d:CloudM9Resolvers):DirectoryListing[]{
 if(!d||!d.token||!d.graphDrive||!d.githubScope||!d.pcloudRegion||!d.nextcloud||!d.egress||!d.awsS3||!d.backblazeB2)
  throw Error('CLOUD_M9_MISSING_VERIFIED_RESOLVER');
 const http=d.http||fetch;
 return [
  new GoogleDriveDirectory(d.token,http),
  new GraphDirectory('onedrive-personal',d.token,undefined,http),
  new GraphDirectory('onedrive-business',d.token,undefined,http),
  new GraphDirectory('sharepoint',d.token,d.graphDrive,http),
  new DropboxDirectory(d.token,http),new BoxDirectory(d.token,http),
  new NextcloudDirectory(d.nextcloud,d.egress,http),
  new S3CompatibleDirectory('s3',d.awsS3,undefined,http),
  new S3CompatibleDirectory('backblaze-b2',undefined,d.backblazeB2,http),
  new PCloudDirectory(d.token,d.pcloudRegion,http),new GithubDirectory(d.token,d.githubScope,http)
 ];
}
