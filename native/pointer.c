// Minimal rootless Wayland pointer click. Protocol license is in the XML.
#include <wayland-client.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "virtual-pointer.h"
static struct zwlr_virtual_pointer_manager_v1 *manager;
static void global(void *data,struct wl_registry *r,uint32_t name,const char *interface,uint32_t version){
 (void)data;(void)version;
 if(!strcmp(interface,"zwlr_virtual_pointer_manager_v1"))manager=wl_registry_bind(r,name,&zwlr_virtual_pointer_manager_v1_interface,1);
}
static void removed(void *data,struct wl_registry *r,uint32_t name){(void)data;(void)r;(void)name;}
int main(int argc,char **argv){
 if(argc!=2||(strcmp(argv[1],"272")&&strcmp(argv[1],"273")&&strcmp(argv[1],"274")))return 2;
 struct wl_display *d=wl_display_connect(NULL);if(!d)return 3;
 struct wl_registry *r=wl_display_get_registry(d);const struct wl_registry_listener listener={global,removed};
 wl_registry_add_listener(r,&listener,NULL);if(wl_display_roundtrip(d)<0||!manager)return 4;
 struct zwlr_virtual_pointer_v1 *p=zwlr_virtual_pointer_manager_v1_create_virtual_pointer(manager,NULL);
 if(wl_display_roundtrip(d)<0)return 5;
 struct timespec now;clock_gettime(CLOCK_MONOTONIC,&now);uint32_t ms=now.tv_sec*1000+now.tv_nsec/1000000;
 uint32_t button=(uint32_t)atoi(argv[1]);
 zwlr_virtual_pointer_v1_button(p,ms,button,WL_POINTER_BUTTON_STATE_PRESSED);zwlr_virtual_pointer_v1_frame(p);wl_display_roundtrip(d);
 struct timespec pause={0,30000000};nanosleep(&pause,NULL);
 zwlr_virtual_pointer_v1_button(p,ms+30,button,WL_POINTER_BUTTON_STATE_RELEASED);zwlr_virtual_pointer_v1_frame(p);
 int status=wl_display_roundtrip(d);zwlr_virtual_pointer_v1_destroy(p);zwlr_virtual_pointer_manager_v1_destroy(manager);wl_registry_destroy(r);wl_display_disconnect(d);
 return status<0?6:0;
}
