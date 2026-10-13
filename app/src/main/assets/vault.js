/* Folder Locker v3: one native vault shared by every page. */
const CATEGORY_RULES={images:{label:'Images',icon:'🖼️',accept:'image/*'},videos:{label:'Videos',icon:'🎬',accept:'video/*'},music:{label:'Music',icon:'🎵',accept:'audio/*'},documents:{label:'Documents',icon:'📄',accept:'.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv'}};
function isNative(){return !!window.AndroidVault;}
function mimeFor(n){let x=(n||'').toLowerCase();if(/\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|tif|tiff)$/.test(x))return'image/*';if(/\.(mp4|mov|mkv|webm|3gp|avi|mpeg|mpg|m4v)$/.test(x))return'video/*';if(/\.(mp3|wav|m4a|ogg|aac|flac|mid|midi|opus|wma)$/.test(x))return'audio/*';if(/\.(html?|css|m?js|cjs|java|json|xml|md|markdown|py|c|h|cpp|hpp|cc|sh|bash|sql|kt|kts|ts|tsx|jsx|gradle|properties|ya?ml|log|ini|cfg|txt|csv)$/.test(x))return'text/plain';if(/\.pdf$/.test(x))return'application/pdf';return'application/octet-stream';}
function listVault(c){if(isNative()){try{return JSON.parse(AndroidVault.listFiles(c)||'[]')}catch(e){return[]}}return[];}
function listTree(){if(isNative()){try{return JSON.parse(AndroidVault.listTree()||'[]')}catch(e){return[]}}return[];}
function pickVault(folder=''){if(isNative()){AndroidVault.pickFiles(folder);return;}document.getElementById('nativePicker')?.click();}
function createVaultFolder(parent,name){return isNative()?AndroidVault.createFolder(parent||'',name):false;}
function deleteVault(path){return isNative()?AndroidVault.deleteFile(path):false;}
function deleteVaultFolder(path){return isNative()?AndroidVault.deleteFolder(path):false;}
function renameVault(path,newName){return isNative()?AndroidVault.renameFile(path,newName):false;}
function renameFolder(path,newName){return isNative()?AndroidVault.renameFolder(path,newName):false;}
function copyVault(path,target){return isNative()?AndroidVault.copyFile(path,target):false;}
function moveVault(path,target){return isNative()?AndroidVault.moveFile(path,target):false;}
function shareVault(path){return isNative()?AndroidVault.shareFile(path):false;}
function shareVaultMany(paths){return isNative()?AndroidVault.shareFiles(JSON.stringify(paths)):false;}
function exportVault(path){return isNative()?AndroidVault.exportFile(path):false;}
function exportVaultMany(paths){return isNative()?AndroidVault.exportFiles(JSON.stringify(paths)):false;}
function removeFromVault(path){return exportVault(path);}
function fileUrl(f){return f.url||f.assetUrl||'';}
function formatSize(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';if(n<1073741824)return(n/1048576).toFixed(1)+' MB';return(n/1073741824).toFixed(2)+' GB';}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showGlobalPopup(icon,title,msg){let p=document.getElementById('popup');if(!p){alert(msg);return;}document.getElementById('pIcon').textContent=icon;document.getElementById('pTitle').textContent=title;document.getElementById('pMsg').textContent=msg;p.classList.add('show');}
function requireUnlock(){if(isNative()&&!AndroidVault.isSessionUnlocked()){location.replace('animations.html');return false;}return true;}
