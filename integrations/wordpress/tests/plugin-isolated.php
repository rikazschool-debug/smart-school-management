<?php
// Isolated WordPress stand-ins. No site/database/network/email is used by this test.
define('ABSPATH', __DIR__);
$options=[];$meta=[];$posts=[];$actions=[];$network=[];$transients=[];$checks=0;
function add_action($name,$callback,$priority=10,$args=1){global $actions;$actions[$name][]=$callback;}
function add_filter($name,$callback){return true;}
function register_activation_hook($file,$callback){global $activate;$activate=$callback;}
function register_deactivation_hook($file,$callback){}
function wp_parse_args($a,$b){return array_merge($b,$a);}
function get_option($name,$fallback=[]){global $options;return $options[$name]??$fallback;}
function update_option($name,$value,$autoload=false){global $options;$options[$name]=$value;}
function wp_next_scheduled($name){return false;}
function wp_schedule_event($time,$schedule,$name){global $scheduled;$scheduled=[$time,$schedule,$name];}
function wp_clear_scheduled_hook($name){}
function get_post($id){global $posts;return $posts[$id]??null;}
function get_post_type($id){return get_post($id)->post_type??null;}
function get_post_meta($id,$key,$single=true){global $meta;return $meta[$id][$key]??'';}
function update_post_meta($id,$key,$value){global $meta;$meta[$id][$key]=$value;}
function get_transient($name){global $transients;return $transients[$name]??null;}
function set_transient($name,$value,$seconds){global $transients;$transients[$name]=$value;}
function delete_transient($name){global $transients;unset($transients[$name]);}
function get_gmt_from_date($v,$format){return gmdate('c',strtotime($v.' UTC'));}
function wp_json_encode($v,$flags=0){return json_encode($v,$flags);}
function wp_generate_uuid4(){return '00000000-0000-4000-8000-'.str_pad((string)random_int(1,99999),12,'0',STR_PAD_LEFT);}
function wp_safe_remote_post($url,$args){global $network;$network[]=[$url,$args];return ['status'=>200,'body'=>json_encode(['ok'=>true,'ref'=>'QA-ONLY'])];}
function wp_remote_post($url,$args){throw new Exception('Unsafe remote function must not be used');}
function wp_remote_retrieve_response_code($r){return $r['status'];}
function wp_remote_retrieve_body($r){return $r['body'];}
function is_wp_error($r){return false;}
function sanitize_text_field($v){return trim($v);}
function sanitize_key($v){return preg_replace('/[^a-z_0-9]/','',$v);}
function get_posts($q){return [];}
function check($value,$description){global $checks;if(!$value)throw new Exception($description);$checks++;}
require dirname(__DIR__).'/rikaz-admissions/rikaz-admissions.php';
$activate();check(empty(rikaz_adm_settings()['enabled']),'Activation must not enable sending');check(count($network)===0,'Activation must not contact receiver');
$now=time();$options[RIKAZ_ADM_OPT]=array_merge(rikaz_adm_settings(),['endpoint'=>'https://receiver.invalid/api/public/admissions/wordpress','source'=>'00000000-0000-4000-8000-000000000001','secret'=>str_repeat('a',64),'not_before'=>$now-10,'enabled'=>false]);
foreach([1=>$now,2=>$now-3600]as$id=>$at){$posts[$id]=(object)['ID'=>$id,'post_type'=>RIKAZ_ADM_PT,'post_status'=>'publish','post_date_gmt'=>gmdate('Y-m-d H:i:s',$at)];$meta[$id]=['reg_parent_name'=>'Synthetic parent','reg_student_name'=>'Synthetic student','reg_phone'=>'966500000001','reg_school'=>'Synthetic school','reg_grade'=>'الابتدائي','reg_date'=>gmdate('Y-m-d H:i:s',$at),'reg_ip'=>'DO-NOT-FORWARD'];}
$insert=$actions['wp_after_insert_post'][0];$insert(1,$posts[1],false);check(get_post_meta(1,'_rikaz_status')==='','Paused insert must not enqueue');
$options[RIKAZ_ADM_OPT]['enabled']=true;$insert(2,$posts[2],false);check(get_post_meta(2,'_rikaz_status')==='','Old posts must not enqueue');
$insert(1,$posts[1],false);check(get_post_meta(1,'_rikaz_status')==='pending','Only current posts should enqueue');
foreach($actions['shutdown']??[]as$f)$f();check(count($network)===1,'New post should issue one simulated request');check(get_post_meta(1,'_rikaz_status')==='success','Success requires receiver acknowledgement');
rikaz_adm_send(1);check(count($network)===1,'Success must never resend');
$request=$network[0][1];check(!array_key_exists('reg_ip',json_decode($request['body'],true))&&!str_contains($request['body'],'DO-NOT-FORWARD'),'IP must never leave WordPress');
$headers=$request['headers'];check(hash_equals($headers['X-Rikaz-Signature'],hash_hmac('sha256',$headers['X-Rikaz-Timestamp'].'.'.$headers['X-Rikaz-Nonce'].'.'.$request['body'],str_repeat('a',64))),'Signature must cover exact body');
rikaz_adm_enqueue(2);rikaz_adm_send(2);check(get_post_meta(2,'_rikaz_status')==='held','Old pending data must stay held');check(count($network)===1,'Old pending data must not be sent by a queue tick');
$options[RIKAZ_ADM_OPT]['enabled']=false;rikaz_adm_enqueue(1);rikaz_adm_send(1);check(count($network)===1,'Pause must protect existing queues');
check($meta[1]['reg_student_name']==='Synthetic student'&&$meta[2]['reg_student_name']==='Synthetic student','Original applications must remain untouched');
echo json_encode(['passed'=>true,'checks'=>$checks,'real_requests'=>0,'real_emails'=>0,'site_touched'=>false]).PHP_EOL;
